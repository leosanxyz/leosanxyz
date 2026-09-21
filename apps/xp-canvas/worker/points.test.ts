import { createRequire } from 'node:module'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CanvasEnv } from './access'
import { readPoints, savePointAward, type PointAward } from './points'

it('starts at zero and keeps one award across retries, undo, and concurrent delivery', async () => {
	const db = new DatabaseSync(':memory:')
	try {
		db.exec('CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'ana\'), (\'luis\');')
		for (const migration of ['0003_points.sql', '0004_gachapon.sql', '0005_gachapon_cost.sql']) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
		const env = { PORTAL_DB: { prepare: (sql: string) => ({ bind: (...values: (string | number)[]) => ({ run: async () => db.prepare(sql).run(...values), first: async () => db.prepare(sql).get(...values) }) }) } } as unknown as CanvasEnv
		const award: PointAward = { sourceKey: 'question:board:shape:revision', eventId: 'event-1', userId: 'ana', amount: 175, activityKind: 'question', createdAt: 1 }
		expect(await readPoints(env, 'ana')).toBe(0)
		await Promise.all([savePointAward(env, award), savePointAward(env, award)])
		expect(await readPoints(env, 'ana')).toBe(175)
		expect(await savePointAward(env, { ...award, eventId: 'event-2', userId: 'luis' })).toBeNull()
		expect(await readPoints(env, 'luis')).toBe(0)
		await savePointAward(env, { ...award, eventId: 'event-3', sourceKey: 'question:board:shape:revision-2', amount: 100 })
		expect(await readPoints(env, 'ana')).toBe(275)
		db.prepare('INSERT INTO gachapon_spins (source_key, user_id, skin, created_at, cost) VALUES (?, ?, ?, ?, ?)').run('machine:round:ana', 'ana', 'arcane-knight', 2, 50)
		expect(await readPoints(env, 'ana')).toBe(225)
		expect(await readPoints(env, 'luis')).toBe(0)
	} finally { db.close() }
})
