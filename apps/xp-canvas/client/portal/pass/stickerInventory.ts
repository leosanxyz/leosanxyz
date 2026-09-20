import type { PassSticker, StickerId } from '../../../shared/pass'

// The starter pack contains one of each design. Placed stickers are in use,
// so taking one off the card returns it to the same inventory.
export function remainingStickerCount(
	stickers: readonly Pick<PassSticker, 'art'>[],
	art: StickerId,
) {
	return Math.max(
		0,
		1 - stickers.filter((sticker) => sticker.art === art).length,
	)
}
