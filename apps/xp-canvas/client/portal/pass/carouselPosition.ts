export const wrapCard = (index: number, count: number) => ((index % count) + count) % count

// Leave one departing card on the left during a swipe, then recycle it offscreen.
export function carouselOffset(index: number, position: number, count: number) {
	const offset = wrapCard(index - position, count)
	return offset >= count - 1 ? offset - count : offset
}

export function nearestCard(index: number, position: number, count: number) {
	return index + Math.round((position - index) / count) * count
}
