// Sonidos del buzón, sintetizados en el navegador: papel que se dobla, sello, vuelo y la carta al caer.
let context: AudioContext | null | undefined
let noise: AudioBuffer | null = null

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

function whiteNoise(ctx: AudioContext) {
	if (!noise) {
		noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
		const data = noise.getChannelData(0)
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
	}
	return noise
}

/** Ruido filtrado con una envolvente corta: suena a papel. */
function paper(ctx: AudioContext, at: number, length: number, from: number, to: number, volume: number) {
	const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
	source.buffer = whiteNoise(ctx)
	filter.type = 'bandpass'; filter.Q.value = 1.4
	filter.frequency.setValueAtTime(from, at)
	filter.frequency.exponentialRampToValueAtTime(to, at + length)
	gain.gain.setValueAtTime(0.0001, at)
	gain.gain.exponentialRampToValueAtTime(volume, at + length * 0.2)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
	source.connect(filter).connect(gain).connect(ctx.destination)
	source.start(at, Math.random() * 0.5, length)
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

export type MailboxSound = 'fold' | 'seal' | 'fly' | 'drop' | 'open'

export function playMailbox(sound: MailboxSound) {
	const ctx = audio()
	if (!ctx) return
	const at = ctx.currentTime + 0.01
	if (sound === 'fold') paper(ctx, at, 0.16, 3200, 1400, 0.22)
	if (sound === 'seal') { tone(ctx, at, 0.12, 190, 80, 0.35); paper(ctx, at, 0.05, 900, 600, 0.12) }
	if (sound === 'fly') paper(ctx, at, 0.42, 700, 3200, 0.08)
	if (sound === 'drop') { tone(ctx, at, 0.16, 150, 70, 0.4); tone(ctx, at + 0.09, 0.9, 1318.5, 1318.5, 0.07); tone(ctx, at + 0.15, 1.1, 1975.5, 1975.5, 0.05) }
	if (sound === 'open') { paper(ctx, at, 0.22, 1600, 2600, 0.14); tone(ctx, at + 0.12, 0.5, 660, 990, 0.05, 'triangle') }
}

/** Crea el contexto de audio antes del primer gesto, para que el primer sonido no se pierda. */
export function prepareMailboxAudio() { audio() }
