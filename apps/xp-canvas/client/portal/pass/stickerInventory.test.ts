import { describe, expect, it } from 'vitest'
import { remainingStickerCount } from './stickerInventory'

describe('starter sticker inventory', () => {
	it('consumes a single unit only while it is on the card', () => {
		expect(remainingStickerCount([], 'frog')).toBe(1)
		expect(remainingStickerCount([{ art: 'frog' }], 'frog')).toBe(0)
		expect(remainingStickerCount([{ art: 'frog' }], 'star')).toBe(1)
	})
	it('keeps older cards with duplicates without offering negative stock', () => {
		expect(
			remainingStickerCount([{ art: 'frog' }, { art: 'frog' }], 'frog'),
		).toBe(0)
	})
})
