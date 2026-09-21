import type { CanvasEnv } from './access'
import { portalDb } from './portalAuth'

export interface PointAward {
	sourceKey: string
	eventId: string
	userId: string
	activityKind: 'question'
	amount: number
	createdAt: number
}

// The activity, identity and amount come from the server, never an award request from a client.
export async function savePointAward(env: CanvasEnv, award: PointAward): Promise<number | null> {
	const db = portalDb(env)
	await db.prepare('INSERT OR IGNORE INTO point_awards (source_key, event_id, user_id, activity_kind, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(award.sourceKey, award.eventId, award.userId, award.activityKind, award.amount, award.createdAt).run()
	const saved = await db.prepare('SELECT event_id, amount FROM point_awards WHERE source_key = ?').bind(award.sourceKey).first<{ event_id: string; amount: number }>()
	if (!saved) throw new Error('No se pudo guardar el premio.')
	// Retrying the same event is safe. Undoing an answered shape cannot create another award.
	return saved.event_id === award.eventId ? saved.amount : null
}

export async function readPoints(env: CanvasEnv, userId: string) {
	const row = await portalDb(env).prepare('SELECT COALESCE((SELECT SUM(amount) FROM point_awards WHERE user_id = ?), 0) - COALESCE((SELECT SUM(cost) FROM gachapon_spins WHERE user_id = ?), 0) AS points').bind(userId, userId).first<{ points: number }>()
	return row?.points ?? 0
}
