import type { PassSticker } from '../../../shared/pass'

export const clamp = (v: number, min: number, max: number) =>
	Math.max(min, Math.min(max, v))
export const wrapAngle = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180
export type CardRect = {
	left: number
	top: number
	width: number
	height: number
}
export function cardPoint(x: number, y: number, r: CardRect) {
	return {
		x: ((x - r.left) / r.width) * 100,
		y: ((y - r.top) / r.height) * 100,
	}
}
export const isOnCard = (p: { x: number; y: number }) =>
	p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100
export function resizeSticker(
	s: PassSticker,
	dx: number,
	dy: number,
	corner: [number, number],
	r: CardRect,
	base: number,
): PassSticker {
	const a = (s.rotation * Math.PI) / 180,
		c = Math.cos(a),
		n = Math.sin(a)
	const ux = corner[0] * c - corner[1] * n,
		uy = corner[0] * n + corner[1] * c
	const size = base * s.scale,
		nextSize = clamp(size + (dx * ux + dy * uy) / 2, base * 0.6, base * 1.6)
	return {
		...s,
		scale: nextSize / base,
		x: clamp(s.x + ((ux * (nextSize - size)) / 2 / r.width) * 100, 8, 92),
		y: clamp(s.y + ((uy * (nextSize - size)) / 2 / r.height) * 100, 8, 92),
	}
}
