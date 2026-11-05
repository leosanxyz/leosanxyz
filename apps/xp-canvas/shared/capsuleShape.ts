import { T } from '@tldraw/validate'
import type { TLShape } from '@tldraw/tlschema'

export const CAPSULE_REASON_MAX = 140
export const CAPSULE_STAKE_MAX = 100
/** Puntos que pone la casa en cada bote. Así la primera apuesta ya tiene algo que ganar. */
export const CAPSULE_SEED = 200
/** Premiar una explicación paga la apuesta por 1.5, con piso para quien apostó cero. */
export const CAPSULE_BONUS_RATE = 1.5
export const CAPSULE_BONUS_FLOOR = 25
export const CAPSULE_OUTCOMES_MAX = 4
export const CAPSULE_BETS_MAX = 300

const text = (min: number, max: number, message: string) => T.string.refine((value) => {
	if (value.trim().length < min || value.length > max) throw new Error(message)
	return value
})
const count = (max: number) => T.integer.refine((value) => {
	if (value < 0 || value > max) throw new Error('Conteo inválido.')
	return value
})
export const outcomeIndex = T.integer.refine((value) => {
	if (value < -1 || value >= CAPSULE_OUTCOMES_MAX) throw new Error('Salida inválida.')
	return value
})

export type CapsuleStatus = 'draft' | 'sealed' | 'resolved'
export type CapsulePayout = { name: string; stake: number; paid: number }

/**
 * Cápsula: una pregunta sellada al final de la clase con dos a cuatro salidas. Los alumnos apuestan puntos
 * hasta la hora de la siguiente clase; entonces Leo sortea apuestas para leerlas y resuelve. Las apuestas
 * viven en el servidor; aquí solo lo público: totales por salida, la apuesta sorteada y el reparto.
 */
export const capsuleShapeProps = {
	w: T.positiveNumber, h: T.positiveNumber,
	question: text(1, 200, 'Escribe la pregunta de la cápsula.'),
	outcomes: T.arrayOf(text(1, 120, 'Salida inválida.')).refine((value) => {
		if (value.length < 2 || value.length > CAPSULE_OUTCOMES_MAX) throw new Error('Pon entre dos y cuatro salidas.')
		return value
	}),
	/** Hora en que se cierra para apostar y se abre en clase, en ms. */
	opensAt: T.number.refine((value) => {
		if (!Number.isFinite(value) || value < 0) throw new Error('Hora inválida.')
		return value
	}),
	status: T.literalEnum('draft', 'sealed', 'resolved'),
	/** Cambia al editar la pregunta o las salidas. Las apuestas van atadas a una revisión. */
	revision: text(1, 100, 'Revisión inválida.'),
	counts: T.arrayOf(count(CAPSULE_BETS_MAX)),
	stakes: T.arrayOf(count(CAPSULE_BETS_MAX * CAPSULE_STAKE_MAX)),
	read: count(CAPSULE_BETS_MAX),
	drawnId: text(0, 100, 'Identificador inválido.'),
	drawnName: text(0, 100, 'Nombre inválido.'),
	drawnOutcome: outcomeIndex,
	drawnStake: count(CAPSULE_STAKE_MAX),
	drawnReason: text(0, CAPSULE_REASON_MAX * 2, 'Porqué demasiado largo.'),
	drawnBonus: count(1_000_000),
	winner: outcomeIndex,
	payouts: T.arrayOf(T.object({ name: text(0, 100, 'Nombre inválido.'), stake: count(CAPSULE_STAKE_MAX), paid: count(1_000_000) })),
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		capsule: {
			w: number; h: number; question: string; outcomes: string[]; opensAt: number; status: CapsuleStatus; revision: string
			counts: number[]; stakes: number[]; read: number
			drawnId: string; drawnName: string; drawnOutcome: number; drawnStake: number; drawnReason: string; drawnBonus: number
			winner: number; payouts: CapsulePayout[]
		}
	}
}
export type CapsuleShape = TLShape<'capsule'>

/** Una apuesta tal como la ve su autor o Leo. */
export type CapsuleBet = { id: string; shapeId: string; revision: string; outcome: number; stake: number; reason: string; name?: string; drawnAt?: number | null; bonus?: number }

export type CapsuleCommand =
	| { action: 'capsule-bet'; shapeId: string; revision: string; outcome: number; stake: number; reason: string }
	| { action: 'capsule-draw'; shapeId: string }
	| { action: 'capsule-bonus'; shapeId: string; betId: string }
	| { action: 'capsule-resolve'; shapeId: string; winner: number }
	| { action: 'capsule-list'; shapeId: string }
export type CapsuleReply =
	| { type: 'capsule-bet'; bet: CapsuleBet }
	| { type: 'capsule-bets'; bets: CapsuleBet[] }
	| { type: 'capsule-done' }

export const reasonLength = (text: string) => [...text].length

export function cleanReason(value: unknown) {
	if (typeof value !== 'string') return null
	const text = value.replace(/\s+/g, ' ').trim()
	return reasonLength(text) <= CAPSULE_REASON_MAX ? text : null
}

export function parseCapsuleCommand(data: Record<string, unknown>): CapsuleCommand | null {
	const shapeId = typeof data.shapeId === 'string' && data.shapeId.startsWith('shape:') && data.shapeId.length <= 100 ? data.shapeId : null
	if (!shapeId || typeof data.action !== 'string' || !data.action.startsWith('capsule-')) return null
	if (data.action === 'capsule-draw' || data.action === 'capsule-list') return { action: data.action, shapeId }
	if (data.action === 'capsule-bonus') return typeof data.betId === 'string' && data.betId.length <= 100 ? { action: 'capsule-bonus', shapeId, betId: data.betId } : null
	if (data.action === 'capsule-resolve') return Number.isInteger(data.winner) && (data.winner as number) >= 0 && (data.winner as number) < CAPSULE_OUTCOMES_MAX ? { action: 'capsule-resolve', shapeId, winner: data.winner as number } : null
	if (data.action !== 'capsule-bet') return null
	const reason = cleanReason(data.reason)
	const { revision, outcome, stake } = data
	if (reason === null || typeof revision !== 'string' || revision.length > 100 || !Number.isInteger(outcome) || !Number.isInteger(stake)) return null
	if ((outcome as number) < 0 || (outcome as number) >= CAPSULE_OUTCOMES_MAX || (stake as number) < 0 || (stake as number) > CAPSULE_STAKE_MAX) return null
	return { action: 'capsule-bet', shapeId, revision, outcome: outcome as number, stake: stake as number, reason }
}

/** La cápsula deja de aceptar apuestas a la hora de clase, sin que nadie la cierre. */
export const capsuleClosed = (shape: Pick<CapsuleShape['props'], 'status' | 'opensAt'>, now = Date.now()) => shape.status !== 'draft' && now >= shape.opensAt
export const capsulePot = (stakes: number[]) => CAPSULE_SEED + stakes.reduce((sum, value) => sum + value, 0)
export const bonusFor = (stake: number) => Math.max(CAPSULE_BONUS_FLOOR, Math.round(stake * CAPSULE_BONUS_RATE))

/**
 * Reparto como en el hipódromo: el bote entero se divide entre quienes acertaron, en proporción a lo que pusieron.
 * Si nadie puso puntos en la salida ganadora, el bote se queda en la casa.
 */
export function capsulePayouts<B extends { outcome: number; stake: number }>(bets: B[], stakes: number[], winner: number) {
	const pot = capsulePot(stakes)
	const winners = bets.filter((bet) => bet.outcome === winner)
	const total = winners.reduce((sum, bet) => sum + bet.stake, 0)
	const rate = total > 0 ? pot / total : 0
	return { pot, rate, payouts: winners.map((bet) => ({ bet, paid: Math.floor(bet.stake * rate) })) }
}
