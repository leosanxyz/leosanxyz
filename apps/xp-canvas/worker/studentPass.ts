import type { CanvasEnv } from './access'
import type { PortalUser } from '../shared/portal'
import { defaultPass, SKINS, type PassProfile, type RewardSkin } from '../shared/pass'
import { portalDb } from './portalAuth'

export async function readPass(user: PortalUser, env: CanvasEnv): Promise<PassProfile> {
	const row = await portalDb(env).prepare('SELECT * FROM student_passes WHERE user_id = ?').bind(user.id).first<{
		intro_json: string
		draft_json: string | null
		completed_at: number | null
		revision: number
	}>()
	const saved = JSON.parse(row?.intro_json ?? '{}')
	const intro: PassProfile['intro'] = {
		name: saved.name || user.name.split(' ')[0],
		message:
			saved.message ||
			'Qué gusto tenerte por aquí. Preparé este espacio para compartir lo que vamos creando en clase. Ojalá te acompañe con las ideas que vienen.',
		skin: SKINS.includes(saved.skin) ? saved.skin : 'xp',
	}
	const unlocked = await portalDb(env).prepare('SELECT DISTINCT skin FROM gachapon_spins WHERE user_id = ?').bind(user.id).all<{ skin: RewardSkin }>()
	return {
		unlockedSkins: unlocked.results.map((row) => row.skin),
		intro,
		draft: row?.draft_json ? JSON.parse(row.draft_json) : defaultPass(intro.name, intro.skin),
		completed: Boolean(row?.completed_at),
		revision: row?.revision ?? 0,
	}
}
