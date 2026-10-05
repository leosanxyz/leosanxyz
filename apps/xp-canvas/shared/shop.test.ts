import { expect, it } from 'vitest'
import { REWARD_SKINS } from './pass'
import { nextShopRotation, SHOP_POOL_SIZE, shopDay, shopPool } from './shop'

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
