import { describe, expect, it } from 'vitest'
import type { PassSticker } from '../../../shared/pass'
import { cardPoint, isOnCard, resizeSticker, wrapAngle } from './stickerGeometry'

const card = { left: 100, top: 80, width: 300, height: 420 }
const sticker: PassSticker = { id: 'test', art: 'frog', x: 50, y: 50, rotation: 0, scale: 1 }
describe('pass sticker manipulation', () => {
	it('separates a drop inside the card from a removal outside', () => {
		expect(cardPoint(250, 290, card)).toEqual({ x: 50, y: 50 })
		expect(isOnCard(cardPoint(100, 80, card))).toBe(true)
		expect(isOnCard(cardPoint(99, 80, card))).toBe(false)
		expect(isOnCard(cardPoint(250, 501, card))).toBe(false)
	})
	it('resizes from a corner while its opposite corner stays put, also when rotated', () => {
		const resized = resizeSticker(sticker, 20, 20, [1, 1], card, 50)
		expect(resized.scale).toBeCloseTo(1.4)
		expect(resized.x / 100 * 300 - resized.scale * 25).toBeCloseTo(125)
		expect(resized.y / 100 * 420 - resized.scale * 25).toBeCloseTo(185)
		const rotated = resizeSticker({ ...sticker, rotation: 90 }, -20, 20, [1, 1], card, 50)
		expect(rotated.scale).toBeCloseTo(1.4)
		expect(rotated.x / 100 * 300 + rotated.scale * 25).toBeCloseTo(175)
		expect(rotated.y / 100 * 420 - rotated.scale * 25).toBeCloseTo(185)
	})
	it('keeps handle results inside the saved size and rotation limits', () => {
		expect(resizeSticker(sticker, 999, 999, [1, 1], card, 50).scale).toBe(1.6)
		expect(resizeSticker(sticker, -999, -999, [1, 1], card, 50).scale).toBe(0.6)
		expect(wrapAngle(181)).toBe(-179)
		expect(wrapAngle(-181)).toBe(179)
	})
})
