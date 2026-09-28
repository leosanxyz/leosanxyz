import { describe, expect, it } from 'vitest'
import { capsuleHop, COIN_SECONDS, HATCH_OPEN, LEVER_SECONDS, machinePose, TUMBLE_SECONDS } from './machinePose'

describe('machinePose', () => {
	it('stays still with reduced motion, but still shows the result', () => {
		const pose = machinePose(3, 0.4, null, true)
		expect(pose).toMatchObject({ sway: 0, shakeX: 0, lever: 0, tumble: 0, hatch: 1 })
		expect(machinePose(3, null, 0, true).coin).toBe(1)
	})

	it('only sways and glows while idle', () => {
		const pose = machinePose(2, null, null, false)
		expect(pose.sway).not.toBe(0)
		expect(pose).toMatchObject({ lever: 0, tumble: 0, hatch: 0, coin: null })
	})

	it('pulls the lever and lets it return to rest', () => {
		expect(machinePose(0, 0.3, null, false).lever).toBeCloseTo(1.05)
		expect(machinePose(0, LEVER_SECONDS, null, false).lever).toBe(0)
		expect(machinePose(0, 0, null, false).lever).toBe(0)
	})

	it('opens the hatch before the capsule leaves the machine', () => {
		expect(machinePose(0, HATCH_OPEN.start, null, false).hatch).toBe(0)
		expect(machinePose(0, HATCH_OPEN.end, null, false).hatch).toBe(1)
	})

	it('slides the coin in and hides it once the spin starts', () => {
		expect(machinePose(0, null, 0, false).coin).toBe(0)
		expect(machinePose(0, null, COIN_SECONDS, false).coin).toBe(1)
		expect(machinePose(0, 0.1, COIN_SECONDS, false).coin).toBeNull()
	})

	it('mixes the capsules only during the first part of the spin, starting at rest', () => {
		expect(machinePose(0, 0.5, null, false).tumble).toBeGreaterThan(0)
		expect(machinePose(0, TUMBLE_SECONDS, null, false).tumble).toBe(0)
		for (let index = 0; index < 16; index++) expect(capsuleHop(index, 0, 1)).toBe(0)
		expect(capsuleHop(2, 0.2, 1)).toBeGreaterThan(0)
	})
})
