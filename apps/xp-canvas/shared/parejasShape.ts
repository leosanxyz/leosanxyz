import { T } from '@tldraw/validate'
import type { TLShape } from '@tldraw/tlschema'

export const PAREJAS_MAX = 60
/** Duración de la animación de un sorteo, en ms. Todos la calculan desde `drawnAt`. */
export const PAREJAS_DURATION = 5200

const text = (min: number, max: number, message: string) => T.string.refine((value) => {
	if (value.length < min || value.length > max) throw new Error(message)
	return value
})
const id = text(1, 100, 'Identificador inválido.')

/** Parejas: una tómbola que sortea parejas entre sus participantes. Los nombres viven aquí porque los alumnos no leen el roster. */
export const parejasShapeProps = {
	w: T.positiveNumber, h: T.positiveNumber,
	title: text(0, 60, 'Título demasiado largo.'),
	participants: T.arrayOf(T.object({ id, name: text(1, 60, 'Nombre inválido.') })).refine((value) => {
		if (value.length > PAREJAS_MAX || new Set(value.map((p) => p.id)).size !== value.length) throw new Error('Participantes inválidos.')
		return value
	}),
	pairs: T.arrayOf(T.arrayOf(id).refine((value) => {
		if (!value.length || value.length > 3) throw new Error('Pareja inválida.')
		return value
	})).refine((value) => {
		const ids = value.flat()
		if (value.length > PAREJAS_MAX || new Set(ids).size !== ids.length) throw new Error('Parejas inválidas.')
		return value
	}),
	drawnAt: T.number.refine((value) => {
		if (value < 0) throw new Error('Fecha inválida.')
		return value
	}),
	revision: id,
}

export type Participant = { id: string; name: string }
declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		parejas: { w: number; h: number; title: string; participants: Participant[]; pairs: string[][]; drawnAt: number; revision: string }
	}
}
export type ParejasShape = TLShape<'parejas'>

/** Quienes aún no tienen pareja, en el orden de `participants`. */
export function remainingParticipants<P extends Participant>(participants: P[], pairs: string[][]) {
	const taken = new Set(pairs.flat())
	return participants.filter((participant) => !taken.has(participant.id))
}

/** Dos al azar. Si quedan exactamente tres, caen juntos para que nadie quede solo; si queda uno, ese. */
export function drawPair<P>(remaining: P[], random: () => number) {
	const pool = [...remaining], count = pool.length === 3 ? 3 : Math.min(2, pool.length)
	for (let i = 0; i < count; i++) {
		const j = i + Math.floor(random() * (pool.length - i))
		;[pool[i], pool[j]] = [pool[j], pool[i]]
	}
	return pool.slice(0, count)
}

/** «Ana y Beto», «Ana, Beto y Caro», «Ana». */
export function pairLabel(names: string[]) {
	return names.length < 2 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}

/**
 * Nombre corto de cada participante, para que quepa en una etiqueta: el primer nombre. Si alguien más
 * de la tómbola lo comparte, también la siguiente palabra; si aún coinciden, el nombre completo.
 */
export function displayNames(participants: Participant[]) {
	const words = participants.map((p) => p.name.trim().split(/\s+/))
	const key = (name: string[], count: number) => name.slice(0, count).join(' ').toLocaleLowerCase('es')
	const repeated = (count: number) => {
		const seen = new Map<string, number>()
		for (const name of words) seen.set(key(name, count), (seen.get(key(name, count)) ?? 0) + 1)
		return (name: string[]) => seen.get(key(name, count))! > 1
	}
	const first = repeated(1), second = repeated(2)
	return new Map(participants.map((p, i) => {
		const name = words[i]
		return [p.id, !first(name) ? name[0] : !second(name) ? name.slice(0, 2).join(' ') : p.name.trim()]
	}))
}
