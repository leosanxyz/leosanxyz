import { cardPoint, type CardRect } from './stickerGeometry'

type PlaneMatrix = Pick<
	DOMMatrixReadOnly,
	'm11' | 'm12' | 'm13' | 'm21' | 'm22' | 'm23' | 'm31' | 'm32' | 'm33'
>

// Invert the perspective projection of the tilted card's z=1 front face.
// Sticker coordinates remain in the unrotated card, not its bounding box.
export function unprojectCardPoint(
	x: number,
	y: number,
	rect: CardRect,
	m: PlaneMatrix,
	perspective: number,
) {
	const sx = x - rect.left - rect.width / 2,
		sy = y - rect.top - rect.height / 2
	const a = m.m11 + (sx * m.m13) / perspective,
		b = m.m21 + (sx * m.m23) / perspective
	const c = m.m12 + (sy * m.m13) / perspective,
		d = m.m22 + (sy * m.m23) / perspective
	const px = sx * (1 - m.m33 / perspective) - m.m31,
		py = sy * (1 - m.m33 / perspective) - m.m32
	const det = a * d - b * c
	if (Math.abs(det) < 0.0001) return cardPoint(x, y, rect)
	return {
		x: 50 + ((px * d - b * py) / det / rect.width) * 100,
		y: 50 + ((a * py - px * c) / det / rect.height) * 100,
	}
}

export function cardProjector(card: HTMLElement) {
	const rect = card.getBoundingClientRect()
	const tilt = card.querySelector<HTMLElement>('.pass-card-tilt')!
	const matrix = new DOMMatrixReadOnly(getComputedStyle(tilt).transform)
	const perspective = parseFloat(getComputedStyle(card).perspective) || 1100
	return {
		rect,
		point: (x: number, y: number) =>
			unprojectCardPoint(x, y, rect, matrix, perspective),
	}
}
