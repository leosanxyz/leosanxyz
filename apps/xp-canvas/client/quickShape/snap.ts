import { snapAngle, type Mat } from 'tldraw'
import type { QuickShapePoint, QuickShapeRecognition } from './classifier'

/**
 * Align a recognized shape to the nearest horizontal or vertical page axis.
 * The recognition itself lives in the draw shape's local coordinates, so the
 * current page rotation must be included before choosing the snapped angle.
 */
export function snapRecognitionToPageAxes(
	recognition: QuickShapeRecognition,
	shapePageRotation: number
): QuickShapeRecognition {
	if (recognition.kind === 'line') {
		const delta = subtract(recognition.end, recognition.start)
		const length = Math.hypot(delta.x, delta.y)
		if (length === 0) return recognition

		const localAngle = Math.atan2(delta.y, delta.x)
		const snappedLocalAngle = snapAngle(shapePageRotation + localAngle, 4) - shapePageRotation
		return {
			...recognition,
			end: {
				x: recognition.start.x + Math.cos(snappedLocalAngle) * length,
				y: recognition.start.y + Math.sin(snappedLocalAngle) * length,
			},
		}
	}

	const halfSize = { x: recognition.bounds.w / 2, y: recognition.bounds.h / 2 }
	const center = add(
		{ x: recognition.bounds.x, y: recognition.bounds.y },
		rotate(halfSize, recognition.rotation)
	)
	const snappedRotation =
		snapAngle(shapePageRotation + recognition.rotation, 4) - shapePageRotation
	const snappedOrigin = subtract(center, rotate(halfSize, snappedRotation))

	return {
		...recognition,
		bounds: {
			...recognition.bounds,
			x: snappedOrigin.x,
			y: snappedOrigin.y,
		},
		rotation: snappedRotation,
	}
}

/** Snap in page coordinates, including strokes drawn inside rotated frames. */
export function snapRecognitionToGrid(
	recognition: QuickShapeRecognition,
	gridSize: number,
	shapeToPage: Mat
): QuickShapeRecognition {
	if (!Number.isFinite(gridSize) || gridSize <= 0) return recognition
	const pageToShape = shapeToPage.clone().invert()
	const snapPoint = (point: QuickShapePoint) => {
		const page = shapeToPage.applyToPoint(point)
		return pageToShape.applyToPoint({
			x: Math.round(page.x / gridSize) * gridSize,
			y: Math.round(page.y / gridSize) * gridSize,
		})
	}
	if (recognition.kind === 'line') {
		const start = snapPoint(recognition.start)
		const end = snapPoint(recognition.end)
		if (Math.hypot(end.x - start.x, end.y - start.y) < 0.001) return recognition
		return { ...recognition, start, end }
	}
	const origin = snapPoint(recognition.bounds)
	const aligned = Math.abs(Math.sin(2 * (shapeToPage.rotation() + recognition.rotation))) < 0.0001
	return {
		...recognition,
		bounds: {
			...recognition.bounds,
			x: origin.x,
			y: origin.y,
			w: aligned ? Math.max(gridSize, Math.round(recognition.bounds.w / gridSize) * gridSize) : recognition.bounds.w,
			h: aligned ? Math.max(gridSize, Math.round(recognition.bounds.h / gridSize) * gridSize) : recognition.bounds.h,
		},
	}
}

function rotate(point: QuickShapePoint, angle: number): QuickShapePoint {
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return {
		x: point.x * cos - point.y * sin,
		y: point.x * sin + point.y * cos,
	}
}

function add(first: QuickShapePoint, second: QuickShapePoint): QuickShapePoint {
	return { x: first.x + second.x, y: first.y + second.y }
}

function subtract(first: QuickShapePoint, second: QuickShapePoint): QuickShapePoint {
	return { x: first.x - second.x, y: first.y - second.y }
}
