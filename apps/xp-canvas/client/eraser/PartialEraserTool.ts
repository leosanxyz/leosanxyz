import { Box, EraserTool, StateNode, pointInPolygon, getDisplayValues, type DrawShapeUtil, type GeoShapeUtil, type HighlightShapeUtil, type LineShapeUtil, type Geometry2d, type JsonObject, type TLShape,
	type Editor, type TLKeyboardEventInfo, type TLPointerEventInfo, type VecLike } from 'tldraw'
import { coversBounds, eraseFrame, ERASABLE_TYPES, getEraseMask, type EraseMask } from './eraseMask'

function inkPadding(editor: Editor, shape: TLShape) {
	let width = 0
	switch (shape.type) {
		case 'draw': width = getDisplayValues(editor.getShapeUtil(shape) as DrawShapeUtil, shape).strokeWidth; break
		case 'highlight': width = getDisplayValues(editor.getShapeUtil(shape) as HighlightShapeUtil, shape).strokeWidth; break
		case 'geo': width = getDisplayValues(editor.getShapeUtil(shape) as GeoShapeUtil, shape).strokeWidth; break
		case 'line': width = getDisplayValues(editor.getShapeUtil(shape) as LineShapeUtil, shape).strokeWidth; break
	}
	return Math.max(2, (width + 1) * ('scale' in shape.props ? Number(shape.props.scale) : 1))
}

class Idle extends StateNode {
	static override id = 'idle'
	override onEnter() { if (!this.editor.inputs.getAccelKey()) (this.parent as EraserTool).maybeReturnToOriginatingTool() }
	override onKeyUp(info: TLKeyboardEventInfo) { if (!info.accelKey) (this.parent as EraserTool).maybeReturnToOriginatingTool() }
	override onPointerDown(info: TLPointerEventInfo) { if (!this.editor.getIsReadonly()) this.parent.transition('erasing', info) }
	override onCancel() { this.editor.setCurrentTool((this.parent as EraserTool).info.onInteractionEnd ?? 'select') }
}

class Erasing extends StateNode {
	static override id = 'erasing'
	private mark = ''
	private scribble = ''
	private previous: VecLike = { x: 0, y: 0 }
	private activeStroke = new Map<string, number>()
	private maxPadding = 0
	override onEnter() {
		this.mark = this.editor.markHistoryStoppingPoint('erase-area')
		this.editor.setSelectedShapes([])
		this.activeStroke.clear()
		this.maxPadding = this.editor.getCurrentPageShapes().reduce((max, shape) =>
			ERASABLE_TYPES.has(shape.type) ? Math.max(max, inkPadding(this.editor, shape)) : max, 0)
		this.previous = { ...this.editor.inputs.getCurrentPagePoint() }
		this.scribble = this.editor.scribbles.addScribble({ color: 'muted-1', size: 24 }).id
		this.erase()
	}
	override onPointerMove() { this.erase() }
	override onPointerUp() { this.erase(); this.parent.transition('idle') }
	override onComplete() { this.parent.transition('idle') }
	override onCancel() { this.editor.bailToMark(this.mark); this.parent.transition('idle') }
	override onExit() { this.editor.scribbles.stop(this.scribble); this.activeStroke.clear() }
	private erase() {
		const editor = this.editor, point = editor.inputs.getCurrentPagePoint(), radius = 12 / editor.getZoomLevel()
		if (editor.getIsReadonly()) return
		editor.scribbles.addPoint(this.scribble, point.x, point.y)
		const previous = this.previous
		this.previous = { ...point }
		const candidates = editor.getShapeIdsInsideBounds(Box.FromPoints([previous, point]).expandBy(radius + this.maxPadding))
		editor.run(() => {
			for (const id of candidates) {
				const shape = editor.getShape(id)
				if (!shape || !ERASABLE_TYPES.has(shape.type) || editor.isShapeOrAncestorLocked(shape)) continue
				const pageMask = editor.getShapeMask(id)
				if (pageMask && !pointInPolygon(point, pageMask)) continue
				const util = editor.getShapeUtil(shape) as unknown as { getUnmaskedGeometry(shape: TLShape): Geometry2d }
				const geometry = util.getUnmaskedGeometry(shape)
				const inverse = editor.getShapePageTransform(shape).clone().invert()
				const a = inverse.applyToPoint(previous), b = inverse.applyToPoint(point)
				const padding = inkPadding(editor, shape), hitRadius = radius + padding
				// Test against original geometry so a last dot cannot become unreachable.
				if (!geometry.hitTestPoint(a, hitRadius, true) && !geometry.hitTestPoint(b, hitRadius, true) && !geometry.hitTestLineSegment(a, b, hitRadius)) continue
				const frame = eraseFrame(shape, geometry.bounds)
				const old = getEraseMask(shape), strokes = old ? [...old.strokes] : []
				const index = this.activeStroke.get(id), active = index === undefined ? undefined : strokes[index]
				const last = active?.points.at(-1)
				if (active && last && Math.hypot(last[0] - a.x, last[1] - a.y) < .001 && active.radius === radius) {
					if (Math.hypot(last[0] - b.x, last[1] - b.y) < .01) continue
					strokes[index!] = { ...active, points: [...active.points, [b.x, b.y]] }
				} else {
					this.activeStroke.set(id, strokes.length)
					strokes.push({ radius, frame, points: [[a.x, a.y], [b.x, b.y]] })
				}
				const mask: EraseMask = { version: 1, frame: old?.frame ?? frame, strokes }
				// Only remove the object when coverage of its padded bounds is certain.
				if (coversBounds(mask, geometry.bounds.clone().expandBy(padding), frame)) editor.deleteShapes([id])
				else editor.updateShapes([{ id, type: shape.type, meta: { ...shape.meta, eraseMask: mask as unknown as JsonObject } }])
			}
		})
	}
}

export class PartialEraserTool extends EraserTool {
	static override children() { return [Idle, Erasing] }
}
export const CANVAS_TOOLS = [PartialEraserTool]
