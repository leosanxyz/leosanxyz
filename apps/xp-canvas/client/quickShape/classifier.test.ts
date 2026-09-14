import { describe, expect, it } from 'vitest'
import { classifyQuickShape, type QuickShapePoint } from './classifier'

describe('classifyQuickShape', () => {
	it('recognizes a hand-drawn line', () => {
		const points = Array.from({ length: 28 }, (_, index) => {
			const t = index / 27
			return { x: 18 + 240 * t, y: 42 + 105 * t + Math.sin(index * 1.7) * 1.4 }
		})

		const result = classifyQuickShape(points)
		expect(result?.kind).toBe('line')
		if (result?.kind === 'line') {
			expect(result.confidence).toBeGreaterThan(0.75)
			expect(result.start.x).toBeCloseTo(18, 0)
			expect(result.end.x).toBeCloseTo(258, 0)
		}
	})

	it('recognizes slow dense Pencil strokes with subpixel back-and-forth jitter', () => {
		const points = Array.from({ length: 900 }, (_, i) => ({
			x: 20 + i * 0.25,
			y: 40 + i * 0.06 + Math.sin(i * 1.7) * 0.8,
		}))
		for (const zoom of [0.5, 1, 4]) {
			const result = classifyQuickShape(points.map(p => ({ x: p.x / zoom, y: p.y / zoom })), zoom)
			expect(result?.kind).toBe('line')
			if (result?.kind === 'line') {
				expect(result.end.x * zoom).toBeCloseTo(points.at(-1)!.x, 0)
			}
		}
	})

	it('keeps rectangle corners with uneven sampling and a trembling final hold', () => {
		const corners = [{ x: 20, y: 20 }, { x: 220, y: 20 },
			{ x: 220, y: 140 }, { x: 20, y: 140 }, { x: 20, y: 20 }]
		const points: QuickShapePoint[] = []
		for (let edge = 0; edge < 4; edge++) {
			const count = edge === 1 ? 500 : 40
			for (let i = 0; i < count; i++) {
				const t = i / count
				points.push({ x: corners[edge].x + (corners[edge + 1].x - corners[edge].x) * t + Math.sin(i * 2) * 0.7,
					y: corners[edge].y + (corners[edge + 1].y - corners[edge].y) * t + Math.cos(i * 2) * 0.7 })
			}
		}
		for (let i = 0; i < 120; i++) points.push({ x: 20 + Math.sin(i) * 0.7, y: 20 + Math.cos(i) * 0.7 })
		const result = classifyQuickShape(points)
		expect(result?.kind).toBe('rectangle')
		if (result?.kind === 'rectangle') {
			expect(result.bounds.w).toBeCloseTo(200, -1)
			expect(result.bounds.h).toBeCloseTo(120, -1)
		}
	})

	it('recognizes a line with a short return at the end', () => {
		const points = sampleOpenPolyline(
			[
				{ x: 20, y: 40 },
				{ x: 250, y: 92 },
				{ x: 226, y: 87 },
			],
			14
		)

		expect(classifyQuickShape(points)?.kind).toBe('line')
	})

	it('recognizes a hand-drawn ellipse', () => {
		const points = sampleEllipse({ x: 150, y: 120 }, 92, 55, 0.3)

		const result = classifyQuickShape(points)
		expect(result?.kind).toBe('ellipse')
		expect(result?.confidence).toBeGreaterThan(0.7)
	})

	it('recognizes an ellipse with a small open seam', () => {
		const points = sampleOpenEllipse({ x: 150, y: 120 }, 92, 55, 0.2, 32)

		expect(classifyQuickShape(points)?.kind).toBe('ellipse')
	})

	it('recognizes a hand-drawn rectangle', () => {
		const rotation = 0.28
		const points = samplePolygon(
			[
				{ x: -105, y: -60 },
				{ x: 105, y: -60 },
				{ x: 105, y: 60 },
				{ x: -105, y: 60 },
			].map((point) => rotateAndTranslate(point, rotation, { x: 145, y: 100 })),
			14
		)

		const result = classifyQuickShape(points)
		expect(result?.kind).toBe('rectangle')
		expect(result?.confidence).toBeGreaterThan(0.7)
		if (result?.kind === 'rectangle') expect(result.rotation).toBeCloseTo(rotation, 1)
	})

	it('recognizes a rectangle left open around one corner', () => {
		const points = sampleOpenPolyline(
			[
				{ x: 58, y: 20 },
				{ x: 220, y: 20 },
				{ x: 220, y: 140 },
				{ x: 20, y: 140 },
				{ x: 20, y: 68 },
			],
			12
		)

		expect(classifyQuickShape(points)?.kind).toBe('rectangle')
	})

	it('recognizes a rectangle with a small overshoot and hook at a corner', () => {
		const points = sampleOpenPolyline(
			[
				{ x: 20, y: 20 },
				{ x: 220, y: 20 },
				{ x: 238, y: 19 },
				{ x: 220, y: 21 },
				{ x: 220, y: 140 },
				{ x: 20, y: 140 },
				{ x: 20, y: 20 },
			],
			10
		)

		expect(classifyQuickShape(points)?.kind).toBe('rectangle')
	})

	it('recognizes a rectangle with a short tail after closing', () => {
		const points = sampleOpenPolyline(
			[
				{ x: 20, y: 20 },
				{ x: 220, y: 20 },
				{ x: 220, y: 140 },
				{ x: 20, y: 140 },
				{ x: 20, y: 20 },
				{ x: 38, y: 31 },
			],
			12
		)

		expect(classifyQuickShape(points)?.kind).toBe('rectangle')
	})

	it('recognizes a hand-drawn triangle', () => {
		const points = samplePolygon(
			[
				{ x: 145, y: 25 },
				{ x: 260, y: 190 },
				{ x: 30, y: 190 },
			],
			18
		)

		const result = classifyQuickShape(points)
		expect(result?.kind).toBe('triangle')
		expect(result?.confidence).toBeGreaterThan(0.7)
	})

	it('rejects an ambiguous scribble', () => {
		const points = Array.from({ length: 80 }, (_, index) => {
			const t = index / 79
			const angle = t * Math.PI * 5
			const radius = 25 + t * 80
			return {
				x: 140 + Math.cos(angle) * radius,
				y: 120 + Math.sin(angle) * radius * 0.7,
			}
		})

		expect(classifyQuickShape(points)).toBeNull()
	})

	it('rejects an ambiguous open curve even when its endpoints are nearby', () => {
		const points = Array.from({ length: 72 }, (_, index) => {
			const t = index / 71
			const angle = t * Math.PI * 1.78
			const radius = 88 - t * 28
			return {
				x: 135 + Math.cos(angle) * radius,
				y: 105 + Math.sin(angle) * radius * 0.72,
			}
		})

		expect(classifyQuickShape(points)).toBeNull()
	})

	it('rejects incomplete and self-crossing polygons', () => {
		const uShape = sampleOpenPolyline(
			[
				{ x: 20, y: 20 },
				{ x: 20, y: 150 },
				{ x: 230, y: 150 },
				{ x: 230, y: 20 },
			],
			12
		)
		const bowTie = sampleOpenPolyline(
			[
				{ x: 20, y: 20 },
				{ x: 230, y: 150 },
				{ x: 20, y: 150 },
				{ x: 230, y: 20 },
				{ x: 20, y: 20 },
			],
			12
		)

		expect(classifyQuickShape(uShape)).toBeNull()
		expect(classifyQuickShape(bowTie)).toBeNull()
	})

	it('measures the minimum shape size in screen pixels at high zoom', () => {
		const points = samplePolygon(
			[
				{ x: -105, y: -60 },
				{ x: 105, y: -60 },
				{ x: 105, y: 60 },
				{ x: -105, y: 60 },
			],
			14
		).map((point) => ({ x: point.x * 0.06, y: point.y * 0.06 }))

		expect(classifyQuickShape(points)).toBeNull()
		expect(classifyQuickShape(points, 8)?.kind).toBe('rectangle')
	})
})

function sampleEllipse(
	center: QuickShapePoint,
	radiusX: number,
	radiusY: number,
	rotation: number
) {
	const count = 72
	return Array.from({ length: count + 1 }, (_, index) => {
		const angle = (index / count) * Math.PI * 2
		const localX = Math.cos(angle) * (radiusX + Math.sin(index * 2.1) * 1.6)
		const localY = Math.sin(angle) * (radiusY + Math.cos(index * 1.7) * 1.2)
		return rotateAndTranslate({ x: localX, y: localY }, rotation, center)
	})
}

function sampleOpenEllipse(
	center: QuickShapePoint,
	radiusX: number,
	radiusY: number,
	rotation: number,
	missingDegrees: number
) {
	const count = 72
	const start = (missingDegrees / 2 / 180) * Math.PI
	const sweep = ((360 - missingDegrees) / 180) * Math.PI
	return Array.from({ length: count }, (_, index) => {
		const angle = start + (index / (count - 1)) * sweep
		return rotateAndTranslate(
			{ x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY },
			rotation,
			center
		)
	})
}

function samplePolygon(corners: readonly QuickShapePoint[], samplesPerEdge: number) {
	const points: QuickShapePoint[] = []
	for (let edge = 0; edge < corners.length; edge++) {
		const start = corners[edge]
		const end = corners[(edge + 1) % corners.length]
		const dx = end.x - start.x
		const dy = end.y - start.y
		const length = Math.hypot(dx, dy)
		const normal = { x: -dy / length, y: dx / length }
		for (let index = 0; index < samplesPerEdge; index++) {
			const t = index / samplesPerEdge
			const wobble = Math.sin((edge * samplesPerEdge + index) * 1.9) * 1.4
			points.push({
				x: start.x + dx * t + normal.x * wobble,
				y: start.y + dy * t + normal.y * wobble,
			})
		}
	}
	points.push({ ...points[0] })
	return points
}

function sampleOpenPolyline(vertices: readonly QuickShapePoint[], samplesPerSegment: number) {
	const points: QuickShapePoint[] = []
	for (let segment = 0; segment < vertices.length - 1; segment++) {
		const start = vertices[segment]
		const end = vertices[segment + 1]
		const dx = end.x - start.x
		const dy = end.y - start.y
		const length = Math.hypot(dx, dy)
		const normal = { x: -dy / length, y: dx / length }
		for (let index = 0; index < samplesPerSegment; index++) {
			const t = index / samplesPerSegment
			const wobble = Math.sin((segment * samplesPerSegment + index) * 1.7) * 1.1
			points.push({
				x: start.x + dx * t + normal.x * wobble,
				y: start.y + dy * t + normal.y * wobble,
			})
		}
	}
	points.push({ ...vertices[vertices.length - 1] })
	return points
}

function rotateAndTranslate(point: QuickShapePoint, angle: number, offset: QuickShapePoint) {
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return {
		x: offset.x + point.x * cos - point.y * sin,
		y: offset.y + point.x * sin + point.y * cos,
	}
}
