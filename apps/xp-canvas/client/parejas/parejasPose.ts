/** Línea de tiempo pura de un sorteo, en segundos desde `drawnAt`. La escena solo la pinta. */
export const SPIN = 2.2
export const TURNS = 3
/** Las bolas del sorteo anterior se retiran de la bandeja. */
export const RETIRE = 0.4
/** Cada bola tarda esto en salir por la compuerta, bajar la rampa y caer en su hueco. */
export const FALL = 0.6
const LAND = 0.35
const OPEN = 0.5
export const SECONDS = 5.2

export const ballStart = (index: number) => SPIN + index * 0.7
export const openAt = (count: number) => count === 3 ? 4.4 : 3.8
/** La pareja entra a la lista y destella la bandeja. */
export const listAt = (count: number) => openAt(count) + 0.8

export type BallPose = {
	/** null mientras sigue en el tambor; 0 en la compuerta … 1 en su hueco. */
	path: number | null
	/** Rebote al caer: positivo se aplasta, negativo se estira. */
	squash: number
	/** 0 cerrada … 1 abierta en dos mitades. */
	open: number
}
export type ParejasPose = {
	/** Giro de la manivela y del tambor, en radianes. */
	crank: number
	/** 0 en reposo … 1 bolas saltando dentro del tambor. */
	shake: number
	/** Bolas del sorteo anterior: 0 en la bandeja … 1 retiradas. */
	retire: number
	balls: BallPose[]
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
const easeInOut = (p: number) => { p = clamp(p); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2 }
/** Rebote amortiguado, como el del buzón. */
const bounce = (age: number) => age < 0 || age > LAND ? 0 : Math.sin(age / LAND * Math.PI * 2) * (1 - age / LAND)

/** `elapsed` es Infinity cuando no hay sorteo en curso: las bolas descansan abiertas en la bandeja. */
export function parejasPose(elapsed: number, count: number, reducedMotion: boolean): ParejasPose {
	if (reducedMotion || elapsed >= SECONDS) return { crank: 0, shake: 0, retire: 1, balls: Array.from({ length: count }, () => ({ path: 1, squash: 0, open: 1 })) }
	const e = Math.max(0, elapsed)
	return {
		crank: TURNS * Math.PI * 2 * easeInOut(e / SPIN),
		shake: e < SPIN + 0.4 ? Math.sin(Math.PI * clamp(e / (SPIN + 0.4))) : 0,
		retire: clamp(e / RETIRE),
		balls: Array.from({ length: count }, (_, i) => {
			const start = ballStart(i)
			return { path: e < start ? null : clamp((e - start) / FALL), squash: bounce(e - start - FALL), open: easeOut((e - openAt(count) - i * 0.08) / OPEN) }
		}),
	}
}

/** Momentos en que suena el trinquete: ocho dientes por vuelta, siguiendo la aceleración de la manivela. */
export const RATCHET = Array.from({ length: TURNS * 8 }, (_, k) => {
	const p = (k + 1) / (TURNS * 8)
	return SPIN * (p < .5 ? Math.cbrt(p / 4) : 1 - Math.cbrt(2 * (1 - p)) / 2)
})
