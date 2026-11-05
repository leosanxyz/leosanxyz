import type { CanvasEnv } from './access'
import { balanceArgs, balanceSql, readPoints } from './points'
import { portalDb } from './portalAuth'
import { PortalError } from './portalHttp'
import {
	cosmetic, cosmeticPrice, forSale, frameItem, MATERIALS_FOR_SALE, ownsCosmetic, plateItem,
	type CosmeticId, type CosmeticItem, type CosmeticPurchase, type CosmeticsState, type EquipSlot,
} from '../shared/cosmetics'
import { defaultHologram, passHologram, validPass, type PassDraft } from '../shared/pass'

/** Items bought with points, from their charges `["cosmetic", user, item]`. */
export async function boughtCosmetics(env: CanvasEnv, userId: string) {
	const rows = await portalDb(env).prepare('SELECT item FROM cosmetics WHERE user_id = ?').bind(userId).all<{ item: string }>()
	return new Set(rows.results.map((row) => row.item))
}

/** What the student bought that is still in the catalog. Free items and open materials are owned without a row: see `ownsCosmetic`. */
export const ownedList = (bought: ReadonlySet<string>) => {
	const items: CosmeticId[] = []
	for (const id of bought) if (cosmetic(id)) items.push(id as CosmeticId)
	return items
}

/** What the pass wears, with anything no longer in the catalog read as nothing. */
export function equippedOf(draft: PassDraft | null): CosmeticsState['equipped'] {
	return {
		plate: plateItem(draft?.plate)?.id ?? null,
		frame: frameItem(draft?.frame)?.id ?? null,
		effect: null,
		material: draft ? passHologram(draft).material : 'none',
	}
}

/** The pass's shop slots must hold items the student owns; the server checks it on every save. */
export async function ownsEquipped(env: CanvasEnv, userId: string, draft: PassDraft) {
	const wanted: CosmeticItem[] = []
	if (draft.plate) wanted.push(cosmetic(draft.plate)!)
	if (draft.frame) wanted.push(cosmetic(draft.frame)!)
	const material = passHologram(draft).material
	if (MATERIALS_FOR_SALE && material !== 'none') wanted.push(cosmetic(`material:${material}`)!)
	if (!wanted.length) return true
	const bought = await boughtCosmetics(env, userId)
	return wanted.every((item) => item && ownsCosmetic(item, bought))
}

export async function cosmeticsState(env: CanvasEnv, userId: string): Promise<CosmeticsState> {
	const [bought, row] = await Promise.all([
		boughtCosmetics(env, userId),
		portalDb(env).prepare('SELECT draft_json FROM student_passes WHERE user_id = ?').bind(userId).first<{ draft_json: string | null }>(),
	])
	return { owned: ownedList(bought), equipped: equippedOf(row?.draft_json ? JSON.parse(row.draft_json) : null) }
}

/** Like a spin, the charge and the ownership are one row, written only if the balance covers it. Its key makes each item a single purchase. */
export async function buyCosmetic(env: CanvasEnv, userId: string, id: unknown, now: number): Promise<CosmeticPurchase> {
	const item = cosmetic(id)
	if (!item) throw new PortalError(400, 'Ese objeto no existe.')
	if (!forSale(item)) throw new PortalError(403, item.kind === 'effect' ? 'Los efectos de perfil llegan pronto.' : 'Este objeto no se vende.')
	const db = portalDb(env), price = cosmeticPrice(item)
	const claimed = await db.prepare(`INSERT OR IGNORE INTO cosmetics (source_key, user_id, item, created_at, cost)
		SELECT ?, ?, ?, ?, ? WHERE ? <= ${balanceSql('?')} RETURNING item`)
		.bind(JSON.stringify(['cosmetic', userId, item.id]), userId, item.id, now, price, price, ...balanceArgs(userId)).first()
	if (!claimed) {
		if ((await boughtCosmetics(env, userId)).has(item.id)) throw new PortalError(409, 'Ya lo tienes.')
		throw new PortalError(409, `Necesitas ${price} puntos para ${item.name}.`)
	}
	const [points, bought] = await Promise.all([readPoints(env, userId), boughtCosmetics(env, userId)])
	return { item: item.id, points, owned: ownedList(bought) }
}

/**
 * Puts an item on the pass, or takes the slot off with `null`. It edits the saved draft under its revision,
 * so a profile open in another tab gets the usual conflict instead of undoing it.
 */
export async function equipCosmetic(env: CanvasEnv, userId: string, slot: unknown, id: unknown): Promise<CosmeticsState['equipped']> {
	if (slot !== 'plate' && slot !== 'frame' && slot !== 'material') throw new PortalError(400, 'Solicitud inválida.')
	const item = id === null ? null : cosmetic(id) ?? null
	if (id !== null && item?.kind !== slot) throw new PortalError(400, 'Ese objeto no va en esa ranura.')
	if (item && !ownsCosmetic(item, await boughtCosmetics(env, userId))) throw new PortalError(403, 'Primero cómpralo.')
	const db = portalDb(env)
	for (let attempt = 0; attempt < 3; attempt++) {
		const row = await db.prepare('SELECT draft_json, revision FROM student_passes WHERE user_id = ?').bind(userId).first<{ draft_json: string | null; revision: number }>()
		if (!row?.draft_json) throw new PortalError(409, 'Termina tu pase antes de equipar algo.')
		const draft = JSON.parse(row.draft_json) as PassDraft
		const next = applyEquip(draft, slot, item)
		if (!validPass(next)) throw new PortalError(409, 'Tu pase guardado no es válido. Ábrelo y guárdalo de nuevo.')
		const saved = await db.prepare('UPDATE student_passes SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision')
			.bind(JSON.stringify(next), Date.now(), userId, row.revision).first()
		if (saved) return equippedOf(next)
	}
	throw new PortalError(409, 'Tu pase cambió mientras tanto. Vuelve a intentarlo.')
}

/** A material goes on as the pass's special finish, the same as choosing it in the profile. */
export function applyEquip(draft: PassDraft, slot: EquipSlot, item: CosmeticItem | null): PassDraft {
	if (slot === 'plate') return { ...draft, plate: item?.kind === 'plate' ? item.id : null }
	if (slot === 'frame') return { ...draft, frame: item?.kind === 'frame' ? item.id : null }
	const hologram = draft.hologram ?? defaultHologram()
	return item?.kind === 'material'
		? { ...draft, finish: 'matte', hologram: { ...hologram, material: item.material } }
		: { ...draft, hologram: { ...hologram, material: 'none' } }
}
