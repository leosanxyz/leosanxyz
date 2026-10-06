import { expect, it } from 'vitest'
import { REWARD_SKINS } from './pass'
import { giftAmount, giftStreak, nextShopRotation, SHOP_POOL_SIZE, shopDay, shopPool } from './shop'

it('picks the same six distinct cards for a day and changes them the next day', () => {
	const pool = shopPool('2026-10-05')
	expect(pool).toEqual(['soraka', 'tracer', 'rengoku', 'emilia', 'starlight-duo', 'zelda-campfire'])
	expect(shopPool('2026-10-05')).toEqual(pool)
	expect(pool).toHaveLength(SHOP_POOL_SIZE)
	expect(new Set(pool).size).toBe(SHOP_POOL_SIZE)
	expect(pool.every((skin) => REWARD_SKINS.includes(skin))).toBe(true)
	expect(shopPool('2026-10-06')).not.toEqual(pool)
})

it('turns the day at midnight in Mexico City', () => {
	// 06:00 UTC is midnight in Mexico City (UTC-6, no daylight saving time).
	const midnight = Date.UTC(2026, 9, 6, 6)
	expect(shopDay(midnight - 1)).toBe('2026-10-05')
	expect(shopDay(midnight)).toBe('2026-10-06')
	expect(nextShopRotation(midnight - 1)).toBe(midnight)
	expect(nextShopRotation(midnight - 5 * 60 * 60 * 1000 - 1234)).toBe(midnight)
	expect(nextShopRotation(midnight)).toBe(midnight + 24 * 60 * 60 * 1000)
})

it('counts the gift streak back from today or yesterday and pays more from the fifth day', () => {
	const days = ['2026-10-05', '2026-10-04', '2026-10-03', '2026-09-30', '2026-10-01']
	expect(giftStreak(days, '2026-10-05')).toBe(3)
	expect(giftStreak(days, '2026-10-06')).toBe(3)
	expect(giftStreak(days, '2026-10-07')).toBe(0)
	expect(giftStreak([], '2026-10-05')).toBe(0)
	// Across a month boundary.
	expect(giftStreak(['2026-11-01', '2026-10-31', '2026-10-30'], '2026-11-01')).toBe(3)
	expect([1, 4, 5, 9].map(giftAmount)).toEqual([25, 25, 50, 50])
})
