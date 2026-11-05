import { createRequire } from 'node:module'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CanvasEnv } from './access'
import { applyEquip, buyCosmetic, cosmeticsState, equipCosmetic, ownsEquipped } from './cosmetics'
import { readPoints } from './points'
import { cosmetic } from '../shared/cosmetics'
import { defaultPass, validPass } from '../shared/pass'

/** D1 over node:sqlite, enough for the cosmetics queries. */
function database() {
	const db = new DatabaseSync(':memory:')
	db.exec("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('ana'), ('luis');")
	db.exec('CREATE TABLE student_passes (user_id TEXT PRIMARY KEY, draft_json TEXT, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER)')
	for (const migration of ['0003_points.sql', '0004_gachapon.sql', '0005_gachapon_cost.sql', '0008_capsule_stakes.sql', '0009_cosmetics.sql']) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
	const statement = (sql: string, values: unknown[] = []) => ({
		bind: (...next: unknown[]) => statement(sql, next),
		run: async () => db.prepare(sql).run(...values),
		first: async () => db.prepare(sql).get(...values) ?? null,
		all: async () => ({ results: db.prepare(sql).all(...values) }),
	})
	const env = { PORTAL_DB: { prepare: (sql: string) => statement(sql) } } as unknown as CanvasEnv
	const award = (user: string, amount: number) => db.prepare("INSERT INTO point_awards (source_key, event_id, user_id, activity_kind, amount, created_at) VALUES (?, ?, ?, 'question', ?, 0)").run(crypto.randomUUID(), crypto.randomUUID(), user, amount)
	const pass = (user: string) => db.prepare('INSERT INTO student_passes (user_id, draft_json) VALUES (?, ?)').run(user, JSON.stringify(defaultPass(user)))
	return { db, env, award, pass }
}

describe('cosmetics on the server', () => {
	it('charges the exact price once, refuses without balance and keeps effects and open materials out of sale', async () => {
		const { db, env, award } = database()
		try {
			award('ana', 250)
			await expect(buyCosmetic(env, 'ana', 'plate:brasa', 1)).rejects.toThrow('Necesitas 500 puntos')
			const bought = await buyCosmetic(env, 'ana', 'plate:aurora', 1)
			expect(bought).toEqual({ item: 'plate:aurora', points: 0, owned: ['plate:aurora'] })
			await expect(buyCosmetic(env, 'ana', 'plate:aurora', 2)).rejects.toThrow('Ya lo tienes')
			expect(await readPoints(env, 'ana')).toBe(0)
			award('ana', 2000)
			await expect(buyCosmetic(env, 'ana', 'effect:eclipse', 3)).rejects.toThrow('llegan pronto')
			await expect(buyCosmetic(env, 'ana', 'plate:grafito', 3)).rejects.toThrow('no se vende')
			await expect(buyCosmetic(env, 'ana', 'material:fuego', 3)).rejects.toThrow('no se vende')
			await expect(buyCosmetic(env, 'ana', 'plate:nope', 3)).rejects.toThrow('no existe')
			// Two taps at once still charge one row.
			await Promise.allSettled([buyCosmetic(env, 'ana', 'frame:cinta', 4), buyCosmetic(env, 'ana', 'frame:cinta', 4)])
			expect(await readPoints(env, 'ana')).toBe(1750)
		} finally { db.close() }
	})
	it('equips only what the student owns, in the right slot, and saves it under a new revision', async () => {
		const { db, env, award, pass } = database()
		try {
			pass('ana'); award('ana', 300)
			await expect(equipCosmetic(env, 'ana', 'plate', 'plate:aurora')).rejects.toThrow('Primero cómpralo')
			await expect(equipCosmetic(env, 'ana', 'frame', 'plate:grafito')).rejects.toThrow('ranura')
			await expect(equipCosmetic(env, 'ana', 'effect', 'effect:orbita')).rejects.toThrow('inválida')
			expect(await equipCosmetic(env, 'ana', 'plate', 'plate:grafito')).toMatchObject({ plate: 'plate:grafito' })
			await buyCosmetic(env, 'ana', 'plate:aurora', 1)
			expect(await equipCosmetic(env, 'ana', 'plate', 'plate:aurora')).toMatchObject({ plate: 'plate:aurora', frame: null })
			expect(await equipCosmetic(env, 'ana', 'material', 'material:fuego')).toMatchObject({ material: 'fuego' })
			expect(await equipCosmetic(env, 'ana', 'frame', 'frame:fino-gris')).toMatchObject({ frame: 'frame:fino-gris', plate: 'plate:aurora' })
			expect(await equipCosmetic(env, 'ana', 'frame', null)).toMatchObject({ frame: null })
			const row = db.prepare("SELECT draft_json, revision FROM student_passes WHERE user_id = 'ana'").get() as { draft_json: string; revision: number }
			expect(row.revision).toBe(5)
			expect(validPass(JSON.parse(row.draft_json))).toBe(true)
			expect((await cosmeticsState(env, 'ana')).equipped).toEqual({ plate: 'plate:aurora', frame: null, effect: null, material: 'fuego' })
			await expect(equipCosmetic(env, 'luis', 'plate', 'plate:grafito')).rejects.toThrow('Termina tu pase')
		} finally { db.close() }
	})
	it('refuses a saved pass that wears something not bought', async () => {
		const { db, env, award } = database()
		try {
			const pass = defaultPass('Ana')
			expect(await ownsEquipped(env, 'ana', { ...pass, plate: 'plate:grafito', frame: 'frame:fino-gris' })).toBe(true)
			expect(await ownsEquipped(env, 'ana', { ...pass, frame: 'frame:oro-vivo' })).toBe(false)
			award('ana', 900)
			await buyCosmetic(env, 'ana', 'frame:oro-vivo', 1)
			expect(await ownsEquipped(env, 'ana', { ...pass, frame: 'frame:oro-vivo' })).toBe(true)
			expect(await ownsEquipped(env, 'luis', { ...pass, frame: 'frame:oro-vivo' })).toBe(false)
		} finally { db.close() }
	})
	it('puts a material on as the special finish and takes it off', () => {
		const pass = { ...defaultPass('Ana'), finish: 'prism' as const }
		const on = applyEquip(pass, 'material', cosmetic('material:hielo')!)
		expect(on.finish).toBe('matte')
		expect(on.hologram?.material).toBe('hielo')
		expect(applyEquip(on, 'material', null).hologram?.material).toBe('none')
	})
})
