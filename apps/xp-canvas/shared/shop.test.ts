import { expect, it } from 'vitest'
import { COSMETICS, cosmetic, forSale, RARITIES, type Rarity } from './cosmetics'
import { isRewardSkin, REWARD_SKINS } from './pass'
import {
	cosmeticRow, drawPrize, gachaPool, giftAmount, giftStreak, nextShopRotation, prizeRarity, SHOP_POOL_SIZE, SHOP_ROWS, shopDay, shopPool, shopSlot, SPIN_WEIGHTS,
	type ShopPrize, type ShopRow,
} from './shop'

const DAYS = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10))
const count = (prizes: readonly ShopPrize[], rarity: Rarity) => prizes.filter((prize) => prizeRarity(prize) === rarity).length

it('fills the machine with six distinct prizes: one legendary, one or two epics, two cards and rares or commons', () => {
	const pool = gachaPool('2026-10-05')
	expect(gachaPool('2026-10-05')).toEqual(pool)
	expect(gachaPool('2026-10-06')).not.toEqual(pool)
	for (const day of DAYS) {
		const prizes = gachaPool(day)
		expect(prizes).toHaveLength(SHOP_POOL_SIZE)
		expect(new Set(prizes).size).toBe(SHOP_POOL_SIZE)
		expect(count(prizes, 'legendaria')).toBe(1)
		expect([1, 2]).toContain(count(prizes, 'epica'))
		expect(prizes.filter(isRewardSkin)).toHaveLength(2)
		expect(prizes.every((prize) => isRewardSkin(prize) || forSale(cosmetic(prize)!))).toBe(true)
		// Rarest first, so the strip opens on the legendary.
		expect(prizes.map((prize) => RARITIES.indexOf(prizeRarity(prize)))).toEqual(prizes.map((prize) => RARITIES.indexOf(prizeRarity(prize))).sort((a, b) => b - a))
	}
})

it('sells six cards per rotation, none of them among the day\'s machine prizes', () => {
	const shop = shopPool('2026-10-05/0')
	expect(shopPool('2026-10-05/0')).toEqual(shop)
	expect(shop).toHaveLength(SHOP_POOL_SIZE)
	expect(new Set(shop).size).toBe(SHOP_POOL_SIZE)
	expect(shop.some((skin) => gachaPool('2026-10-05').includes(skin))).toBe(false)
	expect(shopPool('2026-10-05/1')).not.toEqual(shop)
})

it('deals each cosmetic row by rarity every rotation, from its own part of the catalog', () => {
	expect(cosmeticRow('2026-10-05/0', 'effects')).toEqual(cosmeticRow('2026-10-05/0', 'effects'))
	expect(cosmeticRow('2026-10-05/1', 'effects')).not.toEqual(cosmeticRow('2026-10-05/0', 'effects'))
	const legends = { effects: 0, plates: 0 }, rotations = DAYS.flatMap((day) => [0, 1, 2, 3].map((n) => `${day}/${n}`))
	for (const slot of rotations) for (const row of Object.keys(SHOP_ROWS) as ShopRow[]) {
		const items = cosmeticRow(slot, row)
		expect(items).toHaveLength(SHOP_POOL_SIZE)
		expect(new Set(items).size).toBe(SHOP_POOL_SIZE)
		expect(items.every((id) => (SHOP_ROWS[row] as readonly string[]).includes(cosmetic(id)!.kind) && forSale(cosmetic(id)!))).toBe(true)
		expect(count(items, 'legendaria')).toBeLessThanOrEqual(1)
		expect([1, 2]).toContain(count(items, 'epica'))
		for (const rarity of RARITIES) {
			const catalog = COSMETICS.filter((item) => forSale(item) && item.rarity === rarity && (SHOP_ROWS[row] as readonly string[]).includes(item.kind)).length
			expect(count(items, rarity), `${slot} ${row} ${rarity}`).toBeLessThanOrEqual(Math.ceil(catalog / 2))
		}
		legends[row] += count(items, 'legendaria')
	}
	// A legendary shows up in some rotations, not all.
	for (const row of Object.values(legends)) expect(row / rotations.length).toBeGreaterThan(0.25)
	for (const row of Object.values(legends)) expect(row / rotations.length).toBeLessThan(0.75)
})

it('draws a rarity by its weight, then a prize of it evenly', () => {
	expect(Object.values(SPIN_WEIGHTS).reduce((a, b) => a + b)).toBe(100)
	let state = 1
	const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32
	const pool: ShopPrize[] = ['material:metal', 'material:fuego', 'tracer', 'plate:aurora', 'frame:fino-negro', 'plate:crema']
	const draws = 200_000, seen = new Map<ShopPrize, number>()
	for (let i = 0; i < draws; i++) { const prize = drawPrize(pool, random); seen.set(prize, (seen.get(prize) ?? 0) + 1) }
	const share = (rarity: Rarity) => pool.filter((prize) => prizeRarity(prize) === rarity).reduce((sum, prize) => sum + (seen.get(prize) ?? 0), 0) / draws
	expect(share('comun')).toBeCloseTo(0.55, 2)
	expect(share('rara')).toBeCloseTo(0.30, 2)
	expect(share('epica')).toBeCloseTo(0.12, 2)
	expect(share('legendaria')).toBeCloseTo(0.03, 2)
	// Inside a rarity, each prize is as likely as the others.
	expect((seen.get('tracer') ?? 0) / draws).toBeCloseTo(0.15, 2)
	expect((seen.get('frame:fino-negro') ?? 0) / draws).toBeCloseTo(0.275, 2)
	// Without commons left, their share goes to the rest in proportion.
	seen.clear()
	const rest = pool.filter((prize) => prizeRarity(prize) !== 'comun')
	for (let i = 0; i < draws; i++) { const prize = drawPrize(rest, random); seen.set(prize, (seen.get(prize) ?? 0) + 1) }
	expect((seen.get('material:metal') ?? 0) / draws).toBeCloseTo(3 / 45, 2)
	expect(drawPrize(['tracer'], random)).toBe('tracer')
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
