/** Pure animation timeline for the 3D gachapon, in seconds. */
export const LEVER_SECONDS = 0.9
export const TUMBLE_SECONDS = 1.4
export const COIN_SECONDS = 0.5
/** The capsule peeks out of the hatch just before the reveal takes it to the centre. */
export const HATCH_OPEN = { start: 0.8, end: 1.05 }

export type MachinePose = {
	sway: number
	shakeX: number
	/** Forward rotation of the lever in radians. */
	lever: number
	tumble: number
	/** 0 closed … 1 fully open. */
	hatch: number
	/** Brightness of the inner light, 1 at rest. */
	light: number
	/** Coin travel into the slot: null hidden, 0 above the slot … 1 inside. */
	coin: number | null
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

function leverAngle(age: number) {
	const pull = 0.3
	if (age < pull) return 1.05 * easeOut(age / pull)
	// Spring back with a small overshoot.
	const back = clamp((age - pull) / (LEVER_SECONDS - pull))
	return 1.05 * (1 - back) - Math.sin(back * Math.PI) * 0.12
}

/**
 * `spinAge` is the time since the shared spin started and `coinAge` the time since this viewer
 * inserted a coin; each is null when it does not apply.
 */
export function machinePose(time: number, spinAge: number | null, coinAge: number | null, reducedMotion: boolean): MachinePose {
	const coin = coinAge === null || spinAge !== null ? null : reducedMotion ? 1 : clamp(coinAge / COIN_SECONDS)
	if (reducedMotion) return { sway: 0, shakeX: 0, lever: 0, tumble: 0, hatch: spinAge === null ? 0 : 1, light: 1, coin }
	const sway = Math.sin(time * 0.5) * 0.18
	const idleLight = 1 + Math.sin(time * 2) * 0.05
	if (spinAge === null || spinAge < 0) return { sway, shakeX: 0, lever: 0, tumble: 0, hatch: 0, light: idleLight, coin }
	const remaining = clamp(1 - spinAge / TUMBLE_SECONDS)
	const mixing = spinAge > 0.2 && spinAge < TUMBLE_SECONDS
	return {
		sway,
		shakeX: mixing ? Math.sin(spinAge * 42) * 0.035 * remaining : 0,
		lever: spinAge < LEVER_SECONDS ? leverAngle(spinAge) : 0,
		tumble: remaining,
		hatch: easeOut(clamp((spinAge - HATCH_OPEN.start) / (HATCH_OPEN.end - HATCH_OPEN.start))),
		light: mixing ? 1.25 + Math.sin(spinAge * 30) * 0.35 : 1,
		coin: null,
	}
}

/** Vertical hop of capsule `index` while the machine mixes them; starts at rest so the spin has no jump. */
export function capsuleHop(index: number, spinAge: number, tumble: number) {
	return Math.abs(Math.sin(spinAge * Math.PI * (2 + (index % 3) * 0.45))) * 0.3 * tumble
}
