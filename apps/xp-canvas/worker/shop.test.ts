import { createRequire } from 'node:module'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CanvasEnv } from './access'
import type { AuthSession } from './portalAuth'
import { PortalError } from './portalHttp'
import { readPoints } from './points'
import { handleShopRequest } from './shop'
import { gachaPool, SHOP_CARD_COST, SHOP_SPIN_COST, shopDay, shopPool, shopSlot } from '../shared/shop'

// Every D1 call awaits, so two requests started together interleave one statement at a time, as in the TLA+ model.
const NOW = Date.UTC(2026, 10, 2, 18)
const session = { user: { id: 'ana', username: 'ANA', name: 'Ana', role: 'student', mustChangePassword: false }, groupId: null, version: 1, tokenHash: '', expiresAt: 0, passCompleted: true } as AuthSession
let db: InstanceType<typeof DatabaseSync>, env: CanvasEnv

beforeEach(() => {
	vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
	db = new DatabaseSync(':memory:')
	db.exec('CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'ana\');')
	for (const migration of ['0003_points.sql', '0004_gachapon.sql', '0005_gachapon_cost.sql', '0006_shop.sql']) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
	env = { PORTAL_DB: { prepare: (sql: string) => ({ bind: (...values: (string | number | null)[]) => ({
		run: async () => db.prepare(sql).run(...values),
		first: async () => db.prepare(sql).get(...values) ?? null,
		all: async () => ({ results: db.prepare(sql).all(...values) }),
	}) }) } } as unknown as CanvasEnv
})
afterEach(() => { db.close(); vi.useRealTimers(); vi.restoreAllMocks() })

const award = (amount: number) => db.prepare('INSERT INTO point_awards (source_key, event_id, user_id, activity_kind, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`seed-${amount}`, `seed-${amount}`, 'ana', 'question', amount, 1)

const post = (path: string, data: object) => handleShopRequest(
	new Request(`http://xp${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
	session, env, path, 'POST',
).then((response) => ({ status: response.status, error: '' }), (error: PortalError) => ({ status: error.status, error: error.message }))

/** Both rules of the model: the balance never goes below zero, and every card delivered was charged exactly once. */
async function expectRules() {
	expect(await readPoints(env, 'ana')).toBeGreaterThanOrEqual(0)
	const repeated = db.prepare('SELECT skin, COUNT(*) AS rows FROM gachapon_spins WHERE user_id = ? GROUP BY skin HAVING rows > 1').all('ana')
	expect(repeated).toEqual([])
}

it('sells only one of two different cards bought at once with points for one', async () => {
	award(SHOP_CARD_COST)
	const [first, second] = shopPool(shopSlot(NOW))
	const results = await Promise.all([post('/api/portal/shop/buy', { skin: first }), post('/api/portal/shop/buy', { skin: second })])
	expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
	expect(results.find(({ status }) => status === 409)?.error).toBe(`Necesitas ${SHOP_CARD_COST} puntos para esta carta.`)
	expect(await readPoints(env, 'ana')).toBe(0)
	await expectRules()
})

it('charges a double tap on the same card once', async () => {
	award(2 * SHOP_CARD_COST)
	const [card] = shopPool(shopSlot(NOW))
	const results = await Promise.all([post('/api/portal/shop/buy', { skin: card }), post('/api/portal/shop/buy', { skin: card })])
	expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
	expect(results.find(({ status }) => status === 409)?.error).toBe('Ya tienes esta carta.')
	expect(await readPoints(env, 'ana')).toBe(SHOP_CARD_COST)
	await expectRules()
})

it('lets a card and a spin at once spend only the points there are', async () => {
	award(SHOP_CARD_COST)
	const [card] = shopPool(shopSlot(NOW))
	const results = await Promise.all([post('/api/portal/shop/buy', { skin: card }), post('/api/portal/shop/spin', { spinId: crypto.randomUUID(), free: false })])
	expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
	expect(await readPoints(env, 'ana')).toBeLessThan(SHOP_CARD_COST)
	await expectRules()
})

it('gives two spins at once that drew the same card only one card and one charge', async () => {
	award(2 * SHOP_SPIN_COST)
	// Both spins read the cards owned before either is saved, and both draw the machine's first prize.
	vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T) => array)
	const results = await Promise.all([0, 1].map(() => post('/api/portal/shop/spin', { spinId: crypto.randomUUID(), free: false })))
	expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
	expect(results.find(({ status }) => status === 409)?.error).toBe('La tienda cambió. Vuelve a intentarlo.')
	expect(db.prepare('SELECT skin FROM gachapon_spins').all()).toEqual([{ skin: gachaPool(shopDay(NOW))[0] }])
	expect(await readPoints(env, 'ana')).toBe(SHOP_SPIN_COST)
	await expectRules()
})
