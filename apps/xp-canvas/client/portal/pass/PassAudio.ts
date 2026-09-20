import intro from '../../../design/pass-sounds/intro.mp3'
import reveal from '../../../design/pass-sounds/reveal.mp3'
import celebrate from '../../../design/pass-sounds/celebrate.mp3'
import rip from '../../../design/pass-sounds/rip.mp3'
import pop from '../../../design/pass-sounds/pop.mp3'
import card from '../../../design/pass-sounds/card.mp3'

type Channel = 'accent' | 'paper'
const sounds = {
	enter: { url: intro, gain: 0.28, channel: 'accent' },
	reveal: { url: reveal, gain: 0.24, channel: 'accent' },
	celebrate: { url: celebrate, gain: 0.3, channel: 'accent' },
	rip: { url: rip, gain: 0.55, channel: 'paper' },
	pop: { url: pop, gain: 0.25, channel: 'paper' },
	card: { url: card, gain: 0.45, channel: 'paper' },
} satisfies Record<string, { url: string; gain: number; channel: Channel }>

export type PassSound = keyof typeof sounds
export type PlayPassSound = (sound: PassSound, delay?: number) => void

type Voice = {
	name: PassSound
	source: AudioBufferSourceNode
	gain: GainNode
	finished: Promise<void>
}

export class PassAudio {
	private context: AudioContext | null = null
	private ready: Promise<void> = Promise.resolve()
	private buffers = new Map<PassSound, Promise<AudioBuffer>>()
	private voices = new Map<Channel, Voice>()
	private requests = { accent: 0, paper: 0 }
	private lastPlay = new Map<PassSound, number>()
	private muted = false
	private closed = false
	private abort = new AbortController()
	private tearing = false
	private cancelTearIdle = () => {}

	constructor(
		private createContext = () =>
			new AudioContext({ latencyHint: 'interactive' }),
		private visible = () => document.visibilityState !== 'hidden',
	) {}

	// Called from a pointer/key gesture, never from the initial page render.
	unlock() {
		if (this.closed || this.muted || !this.visible()) return
		try {
			this.context ??= this.createContext()
			if (this.context.state !== 'running')
				this.ready = this.context.resume().catch(() => {})
			for (const name of Object.keys(sounds) as PassSound[])
				void this.load(name).catch(() => {})
		} catch {
			// Audio is optional. A blocked device must not block the pass.
		}
	}

	private load(name: PassSound) {
		const cached = this.buffers.get(name)
		if (cached) return cached
		const context = this.context!
		const buffer = fetch(sounds[name].url, { signal: this.abort.signal })
			.then((response) => {
				if (!response.ok) throw new Error('Sound unavailable')
				return response.arrayBuffer()
			})
			.then((bytes) => context.decodeAudioData(bytes))
			.catch((error) => {
				this.buffers.delete(name)
				throw error
			})
		this.buffers.set(name, buffer)
		return buffer
	}

	async play(name: PassSound, delay = 0, loop = false) {
		const context = this.context
		if (!context || this.closed || this.muted || !this.visible()) return
		const requestedAt = performance.now()
		if (!loop && requestedAt - (this.lastPlay.get(name) ?? -Infinity) < 120)
			return
		this.lastPlay.set(name, requestedAt)
		const sound = sounds[name],
			request = ++this.requests[sound.channel]
		let cancelTimeout = () => {}
		try {
			const buffer = await Promise.race([
				Promise.all([this.ready, this.load(name)]).then(
					([, decoded]) => decoded,
				),
				new Promise<undefined>((resolve) => {
					const timeout = setTimeout(() => resolve(undefined), 700)
					cancelTimeout = () => clearTimeout(timeout)
				}),
			])
			if (
				!buffer ||
				this.closed ||
				this.muted ||
				!this.visible() ||
				context.state !== 'running' ||
				request !== this.requests[sound.channel] ||
				performance.now() - requestedAt > 700
			)
				return
			this.stopVoice(sound.channel)
			const source = context.createBufferSource(),
				gain = context.createGain(),
				start =
					context.currentTime +
					Math.max(0, delay - (performance.now() - requestedAt) / 1000)
			source.buffer = buffer
			source.loop = loop
			gain.gain.setValueAtTime(0, start)
			gain.gain.linearRampToValueAtTime(sound.gain, start + 0.008)
			source.connect(gain)
			gain.connect(context.destination)
			let finish = () => {}
			const finished = new Promise<void>((resolve) => {
				finish = resolve
			})
			const voice = { name, source, gain, finished }
			this.voices.set(sound.channel, voice)
			source.onended = () => {
				source.disconnect()
				gain.disconnect()
				if (this.voices.get(sound.channel) === voice)
					this.voices.delete(sound.channel)
				finish()
			}
			source.start(start)
		} catch {
			// Network/decode/autoplay failures do not interrupt the interaction.
		} finally {
			cancelTimeout()
		}
	}

	// Each forward tear movement keeps one voice alive. Pauses and reversals stop it.
	setTearing(active: boolean) {
		if (!active) {
			this.cancelTearIdle()
			if (!this.tearing) return
			this.tearing = false
			this.requests.paper++
			if (this.voices.get('paper')?.name === 'rip') this.stopVoice('paper')
			return
		}
		if (!this.context || this.closed || this.muted || !this.visible()) return
		this.cancelTearIdle()
		const timeout = setTimeout(() => this.setTearing(false), 100)
		this.cancelTearIdle = () => clearTimeout(timeout)
		if (this.tearing) return
		this.tearing = true
		void this.play('rip', 0, true)
	}

	private stopVoice(channel: Channel) {
		const voice = this.voices.get(channel),
			context = this.context
		if (!voice || !context) return
		const now = context.currentTime
		voice.gain.gain.cancelScheduledValues(now)
		voice.gain.gain.setTargetAtTime(0, now, 0.012)
		voice.source.stop(now + 0.06)
		this.voices.delete(channel)
	}

	stop() {
		this.setTearing(false)
		this.requests.accent++
		this.requests.paper++
		this.stopVoice('accent')
		this.stopVoice('paper')
	}

	setMuted(value: boolean) {
		this.muted = value
		if (value) this.stop()
	}

	pause() {
		this.stop()
		if (this.context?.state === 'running')
			void this.context.suspend().catch(() => {})
	}

	async dispose() {
		this.closed = true
		this.abort.abort()
		const completion = this.voices.get('accent')
		if (
			completion?.name === 'enter' &&
			this.context?.state === 'running' &&
			!this.muted &&
			this.visible()
		) {
			// The final chime can finish while the next page opens.
			this.stopVoice('paper')
			let cancelTimeout = () => {}
			await Promise.race([
				completion.finished,
				new Promise<void>((resolve) => {
					const timeout = setTimeout(() => resolve(), 4500)
					cancelTimeout = () => clearTimeout(timeout)
				}),
			])
			cancelTimeout()
		}
		this.stop()
		if (this.context) void this.context.close().catch(() => {})
		this.buffers.clear()
	}
}
