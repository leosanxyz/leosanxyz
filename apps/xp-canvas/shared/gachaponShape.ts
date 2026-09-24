import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tlschema'
import { questionPoints } from './questionShape'
import { T } from '@tldraw/validate'
import type { TLShape } from '@tldraw/tlschema'
import { isRewardSkin, REWARD_SKINS, type RewardSkin } from './pass'

const id = T.string.refine((value) => {
	if (!value || value.length > 100) throw new Error('Identificador inválido.')
	return value
})
const ids = T.arrayOf(id).refine((value) => {
	if (value.length > 500 || new Set(value).size !== value.length) throw new Error('Lista inválida.')
	return value
})
const versions = createShapePropsMigrationIds('gachapon', { AddCost: 1 })
export const gachaponShapeMigrations = createShapePropsMigrationSequence({ sequence: [{ id: versions.AddCost, up: (props) => { props.cost = 0 }, down: 'retired' }] })
export const gachaponShapeProps = {
	cost: questionPoints,
	w: T.positiveNumber, h: T.positiveNumber,
	pool: T.arrayOf(T.string.refine((value) => {
		if (!isRewardSkin(value)) throw new Error('Premio inválido.')
		return value
	})).refine((value) => {
		if (!value.length || value.length > REWARD_SKINS.length || new Set(value).size !== value.length) throw new Error('Elige al menos un premio.')
		return value
	}),
	allowedUserIds: ids,
	usedUserIds: ids,
	revision: id,
}
declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		gachapon: { cost: number; w: number; h: number; pool: string[]; allowedUserIds: string[]; usedUserIds: string[]; revision: string }
	}
}
export type GachaponShape = TLShape<'gachapon'>
export const GACHAPON_DURATION = 6000
export type GachaponResult = { type: 'gachapon-result'; id: string; shapeId: string; userId: string; name: string; skin: RewardSkin; startedAt: number }
export function isGachaponResult(value: unknown): value is GachaponResult {
	if (!value || typeof value !== 'object') return false
	const v = value as GachaponResult
	return v.type === 'gachapon-result' && typeof v.id === 'string' && typeof v.shapeId === 'string' && typeof v.userId === 'string' && typeof v.name === 'string' && isRewardSkin(v.skin) && Number.isFinite(v.startedAt)
}
