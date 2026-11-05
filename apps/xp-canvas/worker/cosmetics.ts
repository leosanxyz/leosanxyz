import type { CanvasEnv } from './access'
import { balanceArgs, balanceSql, readPoints } from './points'
import { portalDb } from './portalAuth'
import { PortalError } from './portalHttp'
import { cosmetic, cosmeticPrice, forSale, MATERIALS_FOR_SALE, ownsCosmetic, type CosmeticId, type CosmeticItem, type CosmeticPurchase } from '../shared/cosmetics'
import { passHologram, type PassDraft } from '../shared/pass'

/** The key of a cosmetic's one ownership row, bought or won in the machine. */
export const cosmeticKey = (userId: string, item: CosmeticId) => JSON.stringify(['cosmetic', userId, item])

/** Items bought or won, from their rows `["cosmetic", user, item]`. */
export async function boughtCosmetics(env: CanvasEnv, userId: string) {
	const rows = await portalDb(env).prepare('SELECT item FROM cosmetics WHERE user_id = ?').bind(userId).all<{ item: string }>()
	return new Set(rows.results.map((row) => row.item))
}

/** What the student has that is still in the catalog. Free items are owned without a row: see `ownsCosmetic`. */
export const ownedList = (bought: ReadonlySet<string>) => {
	const items: CosmeticId[] = []
	for (const id of bought) if (cosmetic(id)) items.push(id as CosmeticId)
	return items
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

/**
 * Like a spin, the charge and the ownership are one row, written only if the balance covers it. Its key makes each item a single
 * purchase, and the same key on a machine prize means a won item cannot be bought. Only the items in today's rows (`onSale`) are sold.
 */
export async function buyCosmetic(env: CanvasEnv, userId: string, id: unknown, now: number, onSale: readonly string[]): Promise<CosmeticPurchase> {
	const item = cosmetic(id)
	if (!item) throw new PortalError(400, 'Ese objeto no existe.')
	if (!forSale(item)) throw new PortalError(403, item.kind === 'effect' ? 'Los efectos de perfil llegan pronto.' : 'Este objeto no se vende.')
	if (!onSale.includes(item.id)) throw new PortalError(403, 'Eso ya no está en la tienda ahora.')
	const db = portalDb(env), price = cosmeticPrice(item)
	const claimed = await db.prepare(`INSERT OR IGNORE INTO cosmetics (source_key, user_id, item, created_at, cost)
		SELECT ?, ?, ?, ?, ? WHERE ? <= ${balanceSql('?')} RETURNING item`)
		.bind(cosmeticKey(userId, item.id), userId, item.id, now, price, price, ...balanceArgs(userId)).first()
	if (!claimed) {
		if ((await boughtCosmetics(env, userId)).has(item.id)) throw new PortalError(409, 'Ya lo tienes.')
		throw new PortalError(409, `Necesitas ${price} puntos para ${item.name}.`)
	}
	const [points, bought] = await Promise.all([readPoints(env, userId), boughtCosmetics(env, userId)])
	return { item: item.id, points, owned: ownedList(bought) }
}
