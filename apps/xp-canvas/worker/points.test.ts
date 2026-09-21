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
		db.exec(readFileSync(new URL('../migrations/0003_points.sql', import.meta.url), 'utf8'))
		const env = { PORTAL_DB: { prepare: (sql: string) => ({ bind: (...values: (string | number)[]) => ({ run: async () => db.prepare(sql).run(...values), first: async () => db.prepare(sql).get(...values) }) }) } } as unknown as CanvasEnv
		const award: PointAward = { sourceKey: 'question:board:shape:revision', eventId: 'event-1', userId: 'ana', amount: 175, activityKind: 'question', createdAt: 1 }
		expect(await readPoints(env, 'ana')).toBe(0)
		await Promise.all([savePointAward(env, award), savePointAward(env, award)])
		expect(await readPoints(env, 'ana')).toBe(175)
		expect(await savePointAward(env, { ...award, eventId: 'event-2', userId: 'luis' })).toBeNull()
		expect(await readPoints(env, 'luis')).toBe(0)
		await savePointAward(env, { ...award, eventId: 'event-3', sourceKey: 'question:board:shape:revision-2', amount: 100 })
		expect(await readPoints(env, 'ana')).toBe(275)
	} finally { db.close() }
})
