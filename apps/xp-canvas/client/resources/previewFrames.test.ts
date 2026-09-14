import { expect, it } from 'vitest'
import { hasVisiblePixels, previewSampleTimes } from './previewFrames'

it('rejects black or empty captures but accepts dark footage with visible detail', () => {
	expect(hasVisiblePixels(new Uint8ClampedArray([0, 0, 0, 255, 1, 1, 1, 255]))).toBe(false)
	expect(hasVisiblePixels(new Uint8ClampedArray([255, 255, 255, 0]))).toBe(false)
	expect(hasVisiblePixels(new Uint8ClampedArray([0, 0, 0, 255, 9, 12, 15, 255]))).toBe(true)
})

it('samples a bounded set of moments within short and long clips', () => {
	for (const duration of [.04, .5, 1.5, 120]) {
		const times = previewSampleTimes(duration)
		expect(times.length).toBeLessThanOrEqual(4)
		expect(times.every(time => time >= 0 && time < duration)).toBe(true)
		expect(new Set(times).size).toBe(times.length)
	}
	expect(previewSampleTimes(Infinity)).toEqual([.2, 1, 2])
})
