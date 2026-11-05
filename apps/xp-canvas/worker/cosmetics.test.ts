import { createRequire } from 'node:module'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CanvasEnv } from './access'
import { boughtCosmetics, buyCosmetic, ownsEquipped } from './cosmetics'
import { readPoints } from './points'
import { defaultHologram, defaultPass } from '../shared/pass'

const migrate = (db: InstanceType<typeof DatabaseSync>, name: string) => db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))

/** D1 over node:sqlite, enough for the cosmetics queries. */
function database() {
	const db = new DatabaseSync(':memory:')
	db.exec("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('ana'), ('luis');")
	db.exec('CREATE TABLE student_passes (user_id TEXT PRIMARY KEY, draft_json TEXT, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER)')
	for (const migration of ['0003_points.sql', '0004_gachapon.sql', '0005_gachapon_cost.sql', '0008_capsule_stakes.sql', '0009_cosmetics.sql']) migrate(db, migration)
	const statement = (sql: string, values: unknown[] = []) => ({
		bind: (...next: unknown[]) => statement(sql, next),
		run: async () => db.prepare(sql).run(...values),
		first: async () => db.prepare(sql).get(...values) ?? null,
		all: async () => ({ results: db.prepare(sql).all(...values) }),
	})
	const env = { PORTAL_DB: { prepare: (sql: string) => statement(sql) } } as unknown as CanvasEnv
	const award = (user: string, amount: number) => db.prepare("INSERT INTO point_awards (source_key, event_id, user_id, activity_kind, amount, created_at) VALUES (?, ?, ?, 'question', ?, 0)").run(crypto.randomUUID(), crypto.randomUUID(), user, amount)
	return { db, env, award }
}

const ROWS = ['plate:aurora', 'plate:brasa', 'frame:cinta', 'frame:oro-vivo', 'material:fuego', 'plate:grafito', 'effect:eclipse']

describe('cosmetics on the server', () => {
	it('charges the exact price once, only for what is in the rows, and keeps effects and the free basics out of sale', async () => {
		const { db, env, award } = database()
		try {
			award('ana', 250)
			await expect(buyCosmetic(env, 'ana', 'plate:brasa', 1, ROWS)).rejects.toThrow('Necesitas 500 puntos')
			const bought = await buyCosmetic(env, 'ana', 'plate:aurora', 1, ROWS)
			expect(bought).toEqual({ item: 'plate:aurora', points: 0, owned: ['plate:aurora'] })
			await expect(buyCosmetic(env, 'ana', 'plate:aurora', 2, ROWS)).rejects.toThrow('Ya lo tienes')
			expect(await readPoints(env, 'ana')).toBe(0)
			award('ana', 2000)
			await expect(buyCosmetic(env, 'ana', 'plate:neon', 3, ROWS)).rejects.toThrow('ya no está en la tienda')
			await expect(buyCosmetic(env, 'ana', 'effect:eclipse', 3, ROWS)).rejects.toThrow('llegan pronto')
			await expect(buyCosmetic(env, 'ana', 'plate:grafito', 3, ROWS)).rejects.toThrow('no se vende')
			await expect(buyCosmetic(env, 'ana', 'plate:nope', 3, ROWS)).rejects.toThrow('no existe')
			expect(await buyCosmetic(env, 'ana', 'material:fuego', 3, ROWS)).toMatchObject({ points: 1500 })
			// Two taps at once still charge one row.
			await Promise.allSettled([buyCosmetic(env, 'ana', 'frame:cinta', 4, ROWS), buyCosmetic(env, 'ana', 'frame:cinta', 4, ROWS)])
			expect(await readPoints(env, 'ana')).toBe(1250)
		} finally { db.close() }
	})
	it('does not sell what the machine already gave, under the same key', async () => {
		const { db, env, award } = database()
		try {
			db.prepare("INSERT INTO cosmetics (source_key, user_id, item, created_at, cost) VALUES (?, 'ana', 'frame:oro-vivo', 0, 0)").run(JSON.stringify(['cosmetic', 'ana', 'frame:oro-vivo']))
			award('ana', 900)
			await expect(buyCosmetic(env, 'ana', 'frame:oro-vivo', 1, ROWS)).rejects.toThrow('Ya lo tienes')
			expect(await readPoints(env, 'ana')).toBe(900)
		} finally { db.close() }
	})
	it('refuses a saved pass that wears something the student does not own, materials included', async () => {
		const { db, env, award } = database()
		try {
			const pass = defaultPass('Ana'), fuego = { ...pass, hologram: { ...defaultHologram(), material: 'fuego' as const } }
			expect(await ownsEquipped(env, 'ana', { ...pass, plate: 'plate:grafito', frame: 'frame:fino-gris' })).toBe(true)
			expect(await ownsEquipped(env, 'ana', { ...pass, frame: 'frame:oro-vivo' })).toBe(false)
			expect(await ownsEquipped(env, 'ana', fuego)).toBe(false)
			award('ana', 1400)
			await buyCosmetic(env, 'ana', 'frame:oro-vivo', 1, ROWS)
			await buyCosmetic(env, 'ana', 'material:fuego', 1, ROWS)
			expect(await ownsEquipped(env, 'ana', { ...fuego, frame: 'frame:oro-vivo' })).toBe(true)
			expect(await ownsEquipped(env, 'luis', { ...pass, frame: 'frame:oro-vivo' })).toBe(false)
		} finally { db.close() }
	})
	it('keeps a material a student already wore while materials were free, at no cost', async () => {
		const { db, env } = database()
		try {
			const wearing = (material: string) => JSON.stringify({ ...defaultPass('x'), hologram: { ...defaultHologram(), material } })
			db.prepare('INSERT INTO student_passes (user_id, draft_json) VALUES (?, ?), (?, ?)').run('ana', wearing('metal'), 'luis', wearing('none'))
			migrate(db, '0010_material_owners.sql')
			expect([...await boughtCosmetics(env, 'ana')]).toEqual(['material:metal'])
			expect([...await boughtCosmetics(env, 'luis')]).toEqual([])
			expect(await readPoints(env, 'ana')).toBe(0)
			expect(await ownsEquipped(env, 'ana', JSON.parse(wearing('metal')))).toBe(true)
			// Same key as a purchase, so the material cannot be bought again.
			expect(db.prepare("SELECT source_key FROM cosmetics WHERE user_id = 'ana'").get()).toEqual({ source_key: JSON.stringify(['cosmetic', 'ana', 'material:metal']) })
		} finally { db.close() }
	})
})
