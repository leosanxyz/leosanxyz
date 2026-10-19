// Sonidos de Parejas, sintetizados como los del buzón: el trinquete de la manivela, un «plop» por bola y una campanita al abrirse.
import { ballStart, FALL, openAt, RATCHET } from './parejasPose'

/** Un sonido con más retraso que esto se omite: quien llega tarde no oye momentos ya pasados. */
const LATE_SECONDS = 0.3
let context: AudioContext | null | undefined
let noise: AudioBuffer | null = null
const scheduled = new Set<string>()

function audio() {
	if (context === undefined) {
		try { context = new AudioContext({ latencyHint: 'interactive' }) }
		catch { context = null }
		if (context) {
			const unlock = () => { if (context?.state === 'suspended' && !document.hidden) void context.resume().catch(() => {}) }
			for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, unlock, true)
		}
	}
	return context && context.state === 'running' && !document.hidden ? context : null
}

/** Golpe corto de ruido filtrado: un diente del trinquete. */
function click(ctx: AudioContext, at: number, frequency: number, volume: number) {
	if (!noise) {
		noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate)
		const data = noise.getChannelData(0)
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
	}
	const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
	source.buffer = noise
	filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 3
	gain.gain.value = volume
	source.connect(filter).connect(gain).connect(ctx.destination)
	source.start(at)
}

function tone(ctx: AudioContext, at: number, length: number, from: number, to: number, volume: number, type: OscillatorType = 'sine') {
	const oscillator = ctx.createOscillator(), gain = ctx.createGain()
	oscillator.type = type
	oscillator.frequency.setValueAtTime(from, at)
	oscillator.frequency.exponentialRampToValueAtTime(to, at + length)
	gain.gain.setValueAtTime(0.0001, at)
	gain.gain.exponentialRampToValueAtTime(volume, at + 0.012)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
	oscillator.connect(gain).connect(ctx.destination)
	oscillator.start(at); oscillator.stop(at + length + 0.02)
}

/** Programa los sonidos de un sorteo que empezó hace `elapsed` segundos. Cada sorteo suena una sola vez. */
export function scheduleParejasSounds(key: string, elapsed: number, count: number, reducedMotion: boolean) {
	if (scheduled.has(key)) return
	scheduled.add(key)
	if (scheduled.size > 32) scheduled.delete(scheduled.values().next().value!)
	const ctx = audio()
	if (!ctx) return
	const play = (moment: number, sound: (at: number) => void) => { if (moment - elapsed > -LATE_SECONDS) sound(ctx.currentTime + Math.max(0.01, moment - elapsed)) }
	const chime = (at: number) => { tone(ctx, at, 0.9, 1318.5, 1318.5, 0.07, 'triangle'); tone(ctx, at + 0.08, 1.1, 1975.5, 1975.5, 0.05, 'triangle') }
	if (reducedMotion) { play(0, chime); return }
	RATCHET.forEach((moment, i) => play(moment, (at) => click(ctx, at, 2400 + (i % 2) * 300, 0.32)))
	for (let i = 0; i < count; i++) play(ballStart(i) + FALL, (at) => { tone(ctx, at, 0.14, 420, 150, 0.35); click(ctx, at, 900, 0.18) })
	play(openAt(count), chime)
}

/** Crea el contexto de audio antes del primer gesto, para que el primer sonido no se pierda. */
export function prepareParejasAudio() { audio() }
