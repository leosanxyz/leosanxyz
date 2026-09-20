import { expect, it } from 'vitest'
import { carouselOffset, nearestCard, wrapCard } from './carouselPosition'

it('keeps the chosen cover first and cycles the options on its right', () => {
	for (let selected = 0; selected < 10; selected++) {
		expect(carouselOffset(selected, selected, 10)).toBe(0)
		expect(carouselOffset(wrapCard(selected + 1, 10), selected, 10)).toBe(1)
		expect(carouselOffset(wrapCard(selected - 1, 10), selected, 10)).toBe(-1)
	}
	expect(nearestCard(0, 9.8, 10)).toBe(10)
	expect(nearestCard(9, -0.2, 10)).toBe(-1)
	expect(carouselOffset(0, 0.2, 10)).toBeCloseTo(-0.2)
})
