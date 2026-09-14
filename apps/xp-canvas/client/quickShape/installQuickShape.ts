import {
	b64Vecs,
	createShapeId,
	getIndices,
	type Editor,
	type TLDrawShape,
	type TLGeoShape,
	type TLEventInfo,
	type TLLineShape,
	type TLPointerEventInfo,
	type TLShapeId,
} from 'tldraw'
import {
	classifyQuickShape,
	type QuickShapePoint,
	type QuickShapeRecognition,
} from './classifier'
import { snapRecognitionToGrid, snapRecognitionToPageAxes } from './snap'
import { createQuickShapePreview } from './preview'

const HOLD_DURATION_MS = 500
const STATIONARY_RADIUS_PX = 4
const MAX_COUNTED_TICK_MS = 100

interface ArmedStroke {
	pointerId: number
	shapeId: TLShapeId | null
	stationaryPoint: QuickShapePoint
	stationaryMs: number
	didAttemptRecognition: boolean
	recognition: QuickShapeRecognition | null
	previewRecognition: QuickShapeRecognition | null
}

/**
 * Add Apple Pencil QuickShape behavior to tldraw's normal draw tool.
 * The caller controls the feature through `isEnabled` and must dispose the returned listeners.
 */
export function installQuickShape(
	editor: Editor,
	isEnabled: () => boolean,
	isSnapHeld: () => boolean = () => false
) {
	let armedStroke: ArmedStroke | null = null
	const preview = createQuickShapePreview(editor)

	const handleBeforeEvent = (event: TLEventInfo) => {
		if (!isQuickShapePointerDown(editor, event, isEnabled())) return
		preview.hide()

		const point = editor.inputs.getCurrentScreenPoint()
		armedStroke = {
			pointerId: event.pointerId,
			shapeId: null,
			stationaryPoint: { x: point.x, y: point.y },
			stationaryMs: 0,
			didAttemptRecognition: false,
			recognition: null,
			previewRecognition: null,
		}
	}

	const handleEvent = (event: TLEventInfo) => {
		if (!armedStroke) return

		if (event.type === 'pointer') {
			if (event.pointerId !== armedStroke.pointerId) return

			switch (event.name) {
				case 'pointer_down': {
					if (!armedStroke.shapeId) {
						armedStroke = null
						return
					}
					const point = editor.inputs.getCurrentScreenPoint()
					armedStroke.stationaryPoint = { x: point.x, y: point.y }
					break
				}
				case 'pointer_move': {
					const point = editor.inputs.getCurrentScreenPoint()
					if (distance(point, armedStroke.stationaryPoint) > STATIONARY_RADIUS_PX) {
						armedStroke.stationaryPoint = { x: point.x, y: point.y }
						armedStroke.stationaryMs = 0
						armedStroke.didAttemptRecognition = false
						armedStroke.recognition = null
						armedStroke.previewRecognition = null
						preview.hide()
					}
					break
				}
				case 'pointer_up': {
					const stroke = armedStroke
					armedStroke = null; preview.hide()
					const shape = stroke.shapeId ? editor.getShape<TLDrawShape>(stroke.shapeId) : null
					if (shape?.type === 'draw' && stroke.previewRecognition) {
						// The native draw tool has completed the stroke. Replace it in that same undo step.
						editor.run(() => replaceDrawShape(editor, shape, stroke.previewRecognition!))
					}
					break
				}
				case 'right_click':
				case 'middle_click':
					armedStroke = null
					preview.hide()
					break
			}
			return
		}

		if (
			event.type === 'misc' &&
			(event.name === 'cancel' || event.name === 'complete' || event.name === 'interrupt')
		) {
			// tldraw interrupts once while auto-enabling pen mode on the first direct pen stroke.
			if (event.name === 'interrupt' && armedStroke.shapeId === null) return
			armedStroke = null
			preview.hide()
		}
	}

	const handleTick = (elapsed: number) => {
		const stroke = armedStroke
		if (!stroke || !stroke.shapeId) return
		if (!isEnabled() || !editor.inputs.getIsPointing() || !editor.isIn('draw.drawing')) {
			armedStroke = null
			preview.hide()
			return
		}

		const shape = editor.getShape<TLDrawShape>(stroke.shapeId)
		if (!shape || shape.type !== 'draw' || shape.props.isComplete) {
			armedStroke = null
			preview.hide()
			return
		}

		stroke.stationaryMs += Math.min(Math.max(elapsed, 0), MAX_COUNTED_TICK_MS)
		if (stroke.stationaryMs < HOLD_DURATION_MS) return

		if (!stroke.didAttemptRecognition) {
			stroke.didAttemptRecognition = true
			stroke.recognition = classifyQuickShape(getDrawPoints(shape), editor.getZoomLevel())
		}
		const recognition = stroke.recognition
		if (!recognition) return
		let finalRecognition =
			isSnapHeld() || editor.inputs.getShiftKey()
				? snapRecognitionToPageAxes(
						recognition,
						editor.getShapePageTransform(shape)?.rotation() ?? shape.rotation
					)
				: recognition

		const shapeToPage = editor.getShapePageTransform(shape)
		if (editor.getInstanceState().isGridMode && shapeToPage) {
			finalRecognition = snapRecognitionToGrid(finalRecognition, editor.getDocumentSettings().gridSize, shapeToPage)
		}

		stroke.previewRecognition = finalRecognition
		preview.show(shape, finalRecognition)
	}

	const handleNativePointerCancel = (event: PointerEvent) => {
		if (!armedStroke || event.pointerId !== armedStroke.pointerId) return
		armedStroke = null
		preview.hide()
		// tldraw 5.4 does not forward a native pointercancel from its canvas.
		// Reset the draw tool so Safari cannot leave a partial Pencil stroke active
		// or convert it after the operating system has cancelled the pointer.
		editor.cancel()
	}

	// Observe the new local draw shape directly. Cost stays constant as the page grows.
	const removeCreateHandler = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'user' && armedStroke && !armedStroke.shapeId && shape.type === 'draw' && !shape.props.isComplete) armedStroke.shapeId = shape.id
	})
	editor.on('before-event', handleBeforeEvent)
	editor.on('event', handleEvent)
	editor.on('tick', handleTick)
	window.addEventListener('pointercancel', handleNativePointerCancel, true)

	return () => {
		armedStroke = null
		preview.dispose()
		removeCreateHandler()
		editor.off('before-event', handleBeforeEvent)
		editor.off('event', handleEvent)
		editor.off('tick', handleTick)
		window.removeEventListener('pointercancel', handleNativePointerCancel, true)
	}
}

function isQuickShapePointerDown(
	editor: Editor,
	event: TLEventInfo,
	isEnabled: boolean
): event is TLPointerEventInfo {
	return (
		isEnabled &&
		event.type === 'pointer' &&
		event.name === 'pointer_down' &&
		event.isPen &&
		event.button === 0 &&
		editor.isIn('draw.idle') &&
		!editor.getIsReadonly()
	)
}

function getDrawPoints(shape: TLDrawShape): QuickShapePoint[] {
	const points: QuickShapePoint[] = []
	for (const segment of shape.props.segments) {
		for (const point of b64Vecs.decodePoints(segment.path, segment.dim)) {
			const next = {
				x: point.x * shape.props.scaleX,
				y: point.y * shape.props.scaleY,
			}
			const previous = points[points.length - 1]
			if (!previous || previous.x !== next.x || previous.y !== next.y) points.push(next)
		}
	}
	return points
}

function replaceDrawShape(
	editor: Editor,
	shape: TLDrawShape,
	recognition: QuickShapeRecognition
) {
	const replacementId = createShapeId()
	const common = {
		id: replacementId,
		parentId: shape.parentId,
		index: shape.index,
		isLocked: shape.isLocked,
		opacity: shape.opacity,
		meta: shape.meta,
	}

	editor.deleteShape(shape.id)

	if (recognition.kind === 'line') {
		const [startIndex, endIndex] = getIndices(2)
		editor.createShape<TLLineShape>({
			...common,
			type: 'line',
			x: shape.x,
			y: shape.y,
			rotation: shape.rotation,
			props: {
				color: shape.props.color,
				dash: shape.props.dash,
				size: shape.props.size,
				scale: shape.props.scale,
				spline: 'line',
				points: {
					[startIndex]: {
						id: startIndex,
						index: startIndex,
						x: recognition.start.x,
						y: recognition.start.y,
					},
					[endIndex]: {
						id: endIndex,
						index: endIndex,
						x: recognition.end.x,
						y: recognition.end.y,
					},
				},
			},
		})
		return
	}

	const offset = rotate(
		{ x: recognition.bounds.x, y: recognition.bounds.y },
		shape.rotation
	)
	editor.createShape<TLGeoShape>({
		...common,
		type: 'geo',
		x: shape.x + offset.x,
		y: shape.y + offset.y,
		rotation: shape.rotation + recognition.rotation,
		props: {
			geo: recognition.kind,
			w: recognition.bounds.w,
			h: recognition.bounds.h,
			color: shape.props.color,
			dash: shape.props.dash,
			fill: shape.props.fill,
			size: shape.props.size,
			scale: shape.props.scale,
		},
	})
}

function rotate(point: QuickShapePoint, angle: number) {
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return {
		x: point.x * cos - point.y * sin,
		y: point.x * sin + point.y * cos,
	}
}

function distance(first: QuickShapePoint, second: QuickShapePoint) {
	return Math.hypot(first.x - second.x, first.y - second.y)
}
