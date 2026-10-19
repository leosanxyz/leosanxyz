import { describe, expect, it } from 'vitest'
import { ballStart, FALL, openAt, parejasPose, RATCHET, SECONDS, SPIN, TURNS } from './parejasPose'
import { PAREJAS_DURATION } from '../../shared/parejasShape'

describe('parejasPose', () => {
	it('shows the pair open in the tray with reduced motion or at rest', () => {
		for (const pose of [parejasPose(0.5, 2, true), parejasPose(Infinity, 2, false)]) {
			expect(pose).toMatchObject({ crank: 0, shake: 0, retire: 1 })
			expect(pose.balls).toEqual([{ path: 1, squash: 0, open: 1 }, { path: 1, squash: 0, open: 1 }])
		}
		expect(SECONDS * 1000).toBe(PAREJAS_DURATION)
	})

	it('turns the crank three times, starting and ending at rest', () => {
		expect(parejasPose(0, 2, false)).toMatchObject({ crank: 0, shake: 0 })
		expect(parejasPose(SPIN, 2, false).crank).toBeCloseTo(TURNS * Math.PI * 2)
		expect(parejasPose(1, 2, false).shake).toBeGreaterThan(0)
	})

	it('drops each ball in turn, the third one only in a trio, and opens them after', () => {
		const second = ballStart(1)
		expect(parejasPose(second - 0.01, 2, false).balls.map((b) => b.path)).toEqual([1, null])
		expect(parejasPose(second + FALL, 2, false).balls[1].path).toBe(1)
		expect(parejasPose(ballStart(2) + FALL, 3, false).balls[2]).toMatchObject({ path: 1, open: 0 })
		expect(parejasPose(openAt(2) + 1, 2, false).balls.every((b) => b.open === 1)).toBe(true)
	})

	it('ticks faster in the middle of the spin than at its ends', () => {
		expect(RATCHET).toHaveLength(TURNS * 8)
		expect(RATCHET.at(-1)).toBeCloseTo(SPIN)
		const gap = (i: number) => RATCHET[i + 1] - RATCHET[i]
		expect(gap(11)).toBeLessThan(gap(0))
		expect(gap(11)).toBeLessThan(gap(22))
	})
})
