import type { Box, Geometry2d, TLShape, VecLike } from 'tldraw'

export interface EraseFrame { x: number; y: number; w: number; h: number; flipX: boolean; flipY: boolean }
export interface EraseStroke { radius: number; points: number[][]; frame: EraseFrame }
export interface EraseMask { version: 1; frame: EraseFrame; strokes: EraseStroke[] }
export const ERASABLE_TYPES = new Set(['draw', 'highlight', 'geo', 'line'])

export function getEraseMask(shape: TLShape): EraseMask | undefined {
	const value = shape.meta.eraseMask as unknown as EraseMask | undefined
	if (!value || value.version !== 1 || !value.frame || !Array.isArray(value.strokes)) return
	const { x, y, w, h } = value.frame
	if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return
	if (!value.strokes.every((stroke) => stroke && Number.isFinite(stroke.radius) && stroke.radius > 0 && Array.isArray(stroke.points) &&
		stroke.frame && [stroke.frame.x, stroke.frame.y, stroke.frame.w, stroke.frame.h].every(Number.isFinite) && stroke.frame.w > 0 && stroke.frame.h > 0 &&
		stroke.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) return
	return value
}

export function eraseFrame(shape: TLShape, bounds: Box): EraseFrame {
	let flipX = false, flipY = false
	if (shape.type === 'draw' || shape.type === 'highlight') {
		flipX = shape.props.scaleX < 0; flipY = shape.props.scaleY < 0
	} else if (shape.type === 'geo') {
		flipX = shape.props.flipX; flipY = shape.props.flipY
	} else if (shape.type === 'line') {
		const points = Object.values(shape.props.points).sort((a, b) => a.index.localeCompare(b.index))
		if (points.length > 1) { flipX = points[0].x > points.at(-1)!.x; flipY = points[0].y > points.at(-1)!.y }
	}
	return { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h), flipX, flipY }
}

export function maskTransform(from: EraseFrame, to: EraseFrame) {
	const sx = to.w / from.w * (from.flipX === to.flipX ? 1 : -1), sy = to.h / from.h * (from.flipY === to.flipY ? 1 : -1)
	return { sx, sy, tx: to.x - sx * from.x + (sx < 0 ? to.w : 0), ty: to.y - sy * from.y + (sy < 0 ? to.h : 0) }
}

export function toMaskPoint(point: VecLike, from: EraseFrame, to: EraseFrame) {
	const { sx, sy, tx, ty } = maskTransform(from, to)
	return { x: (point.x - tx) / sx, y: (point.y - ty) / sy }
}

export function distanceToSegmentSquared(p: VecLike, a: number[], b: number[]) {
	const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy
	const t = length ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / length)) : 0
	return (p.x - a[0] - t * dx) ** 2 + (p.y - a[1] - t * dy) ** 2
}

export function isErased(point: VecLike, mask: EraseMask, frame = mask.frame) {
	return mask.strokes.some((stroke) => {
		const local = toMaskPoint(point, stroke.frame, frame)
		return stroke.points.some((p, i) => distanceToSegmentSquared(local, p, stroke.points[Math.max(0, i - 1)]) <= stroke.radius ** 2)
	})
}

/** Keep original bounds and curves. Only hit-testing inside a cutout changes. */
export function maskedGeometry<T extends Geometry2d>(shape: TLShape, geometry: T): T {
	const mask = getEraseMask(shape)
	if (!mask) return geometry
	const frame = eraseFrame(shape, geometry.bounds)
	const result = Object.create(geometry) as T
	result.hitTestPoint = (point, ...args) => !isErased(point, mask, frame) && geometry.hitTestPoint(point, ...args)
	return result
}

export function maskPaths(mask: EraseMask, frame = mask.frame, scale = 1) {
	return mask.strokes.map((stroke) => {
		const [first, ...rest] = stroke.points
		if (!first) return []
		const d = `M${first[0]} ${first[1]}` + (rest.length ? rest.map((p) => `L${p[0]} ${p[1]}`).join('') : `l0.001 0`)
		const { sx, sy, tx, ty } = maskTransform(stroke.frame, frame)
		return [{ d, transform: `matrix(${sx / scale} 0 0 ${sy / scale} ${tx / scale} ${ty / scale})`, strokeWidth: stroke.radius * 2 }]
	}).flat()
}

/** True only when one convex eraser capsule covers the entire cell. Conservative at seams. */
export function coversBounds(mask: EraseMask, bounds: { x: number; y: number; w: number; h: number }, frame = mask.frame, depth = 0): boolean {
	const corners = [{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y },
		{ x: bounds.x, y: bounds.y + bounds.h }, { x: bounds.x + bounds.w, y: bounds.y + bounds.h }]
	if (mask.strokes.some((stroke) => stroke.points.some((p, i) => corners.every((corner) =>
		distanceToSegmentSquared(toMaskPoint(corner, stroke.frame, frame), p, stroke.points[Math.max(0, i - 1)]) < stroke.radius ** 2)))) return true
	if (depth >= 7 || corners.some((p) => !isErased(p, mask, frame))) return false
	const w = bounds.w / 2, h = bounds.h / 2
	return [[0, 0], [w, 0], [0, h], [w, h]].every(([x, y]) => coversBounds(mask, { x: bounds.x + x, y: bounds.y + y, w, h }, frame, depth + 1))
}
