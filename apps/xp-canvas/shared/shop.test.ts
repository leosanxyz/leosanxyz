import { expect, it } from 'vitest'
import { REWARD_SKINS } from './pass'
import { gachaPool, giftAmount, giftStreak, nextShopRotation, SHOP_POOL_SIZE, shopDay, shopPool, shopSlot } from './shop'

it('picks the same six distinct machine prizes for a day and changes them the next day', () => {
	const pool = gachaPool('2026-10-05')
	expect(pool).toEqual(['soraka', 'tracer', 'rengoku', 'emilia', 'starlight-duo', 'zelda-campfire'])
	expect(gachaPool('2026-10-05')).toEqual(pool)
	expect(pool).toHaveLength(SHOP_POOL_SIZE)
	expect(new Set(pool).size).toBe(SHOP_POOL_SIZE)
	expect(pool.every((skin) => REWARD_SKINS.includes(skin))).toBe(true)
	expect(gachaPool('2026-10-06')).not.toEqual(pool)
})

it('sells six cards per rotation, none of them among the day\'s machine prizes', () => {
	const shop = shopPool('2026-10-05/0')
	expect(shopPool('2026-10-05/0')).toEqual(shop)
	expect(shop).toHaveLength(SHOP_POOL_SIZE)
	expect(new Set(shop).size).toBe(SHOP_POOL_SIZE)
	expect(shop.some((skin) => gachaPool('2026-10-05').includes(skin))).toBe(false)
	expect(shopPool('2026-10-05/1')).not.toEqual(shop)
})

it('turns the day at midnight in Mexico City', () => {
	// 06:00 UTC is midnight in Mexico City (UTC-6, no daylight saving time).
	const midnight = Date.UTC(2026, 9, 6, 6)
	expect(shopDay(midnight - 1)).toBe('2026-10-05')
	expect(shopDay(midnight)).toBe('2026-10-06')
	expect(nextShopRotation(midnight - 1)).toBe(midnight)
	expect(nextShopRotation(midnight - 5 * 60 * 60 * 1000 - 1234)).toBe(midnight)
	expect(nextShopRotation(midnight)).toBe(midnight + 6 * 60 * 60 * 1000)
})

it('rotates the pool every six hours from midnight in Mexico City', () => {
	const midnight = Date.UTC(2026, 9, 5, 6), sixAm = Date.UTC(2026, 9, 5, 12)
	expect([shopSlot(midnight - 1), shopSlot(midnight)]).toEqual(['2026-10-04/3', '2026-10-05/0'])
	expect([shopSlot(sixAm - 1), shopSlot(sixAm)]).toEqual(['2026-10-05/0', '2026-10-05/1'])
	expect(nextShopRotation(Date.parse('2026-10-05T11:59:00Z'))).toBe(Date.parse('2026-10-05T12:00:00Z'))
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
