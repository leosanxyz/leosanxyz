import { describe, expect, it } from 'vitest'
import type { QuickShapePoint, QuickShapeRecognition } from './classifier'
import { Mat } from 'tldraw'
import { snapRecognitionToGrid, snapRecognitionToPageAxes } from './snap'

describe('snapRecognitionToPageAxes', () => {
	it('snaps a nearly horizontal line to the horizontal page axis', () => {
		const shapePageRotation = 0.21
		const length = 120
		const localAngle = -0.14
		const recognition: QuickShapeRecognition = {
			kind: 'line',
			confidence: 0.91,
			start: { x: 12, y: 18 },
			end: {
				x: 12 + Math.cos(localAngle) * length,
				y: 18 + Math.sin(localAngle) * length,
			},
		}

		const result = snapRecognitionToPageAxes(recognition, shapePageRotation)
		expect(result.kind).toBe('line')
		if (result.kind !== 'line') return

		expect(result.start).toEqual(recognition.start)
		const pageDelta = rotate(subtract(result.end, result.start), shapePageRotation)
		expect(pageDelta.x).toBeCloseTo(length, 8)
		expect(pageDelta.y).toBeCloseTo(0, 8)
	})

	it('snaps a nearly vertical line to the vertical page axis', () => {
		const shapePageRotation = -0.17
		const length = 75
		const localAngle = 1.68
		const recognition: QuickShapeRecognition = {
			kind: 'line',
			confidence: 0.88,
			start: { x: -8, y: 24 },
			end: {
				x: -8 + Math.cos(localAngle) * length,
				y: 24 + Math.sin(localAngle) * length,
			},
		}

		const result = snapRecognitionToPageAxes(recognition, shapePageRotation)
		expect(result.kind).toBe('line')
		if (result.kind !== 'line') return

		expect(result.start).toEqual(recognition.start)
		const pageDelta = rotate(subtract(result.end, result.start), shapePageRotation)
		expect(pageDelta.x).toBeCloseTo(0, 8)
		expect(pageDelta.y).toBeCloseTo(length, 8)
	})

	it('snaps a figure to a multiple of 90 degrees without moving its center', () => {
		const shapePageRotation = 0.12
		const recognition: QuickShapeRecognition = {
			kind: 'rectangle',
			confidence: 0.94,
			bounds: { x: 40, y: 30, w: 160, h: 90 },
			rotation: 0.31,
		}
		const centerBefore = getRecognitionCenter(recognition)

		const result = snapRecognitionToPageAxes(recognition, shapePageRotation)
		expect(result.kind).toBe('rectangle')
		if (result.kind === 'line') return

		const pageRotation = result.rotation + shapePageRotation
		expect(Math.sin(pageRotation * 2)).toBeCloseTo(0, 8)
		expect(getRecognitionCenter(result).x).toBeCloseTo(centerBefore.x, 8)
		expect(getRecognitionCenter(result).y).toBeCloseTo(centerBefore.y, 8)
		expect(result.bounds.w).toBe(recognition.bounds.w)
		expect(result.bounds.h).toBe(recognition.bounds.h)
	})
})

function getRecognitionCenter(
	recognition: Exclude<QuickShapeRecognition, { kind: 'line' }>
): QuickShapePoint {
	const halfSize = { x: recognition.bounds.w / 2, y: recognition.bounds.h / 2 }
	const rotatedHalfSize = rotate(halfSize, recognition.rotation)
	return {
		x: recognition.bounds.x + rotatedHalfSize.x,
		y: recognition.bounds.y + rotatedHalfSize.y,
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

function subtract(first: QuickShapePoint, second: QuickShapePoint): QuickShapePoint {
	return { x: first.x - second.x, y: first.y - second.y }
}


describe('snapRecognitionToGrid', () => {
	it('snaps line endpoints in page space inside a rotated parent', () => {
		const transform = Mat.Translate(-23, 37).rotate(Math.PI / 3)
		const result = snapRecognitionToGrid({ kind: 'line', confidence: 1,
			start: { x: 7, y: 9 }, end: { x: 137, y: 23 } }, 10, transform)
		expect(result.kind).toBe('line')
		if (result.kind !== 'line') return
		for (const point of [result.start, result.end]) {
			const page = transform.applyToPoint(point)
			expect(page.x / 10).toBeCloseTo(Math.round(page.x / 10), 8)
			expect(page.y / 10).toBeCloseTo(Math.round(page.y / 10), 8)
		}
	})

	it('snaps aligned bounds without flattening a rotated figure', () => {
		const shape = { kind: 'rectangle' as const, confidence: 1,
			bounds: { x: 13, y: 24, w: 123, h: 77 }, rotation: 0 }
		expect(snapRecognitionToGrid(shape, 10, Mat.Translate(4, 3))).toMatchObject({
			bounds: { x: 16, y: 27, w: 120, h: 80 }, rotation: 0,
		})
		expect(snapRecognitionToGrid({ ...shape, rotation: 0.3 }, 10, Mat.Translate(4, 3)))
			.toMatchObject({ bounds: { w: 123, h: 77 }, rotation: 0.3 })
	})
})
