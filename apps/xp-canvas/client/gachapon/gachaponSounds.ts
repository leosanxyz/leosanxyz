import popUrl from '../../design/pass-sounds/pop.mp3'
import celebrateUrl from '../../design/pass-sounds/celebrate.mp3'
import confettiUrl from '../../design/question-sounds/1gift-confetti.mp3'

/** Moments of the shared spin, in seconds after it starts. They match the keyframes in gachapon.css. */
export const SPIN_MOMENTS = { burst: 2.9, card: 3.0 }
/** A sound more than this late is skipped, so viewers who arrive mid-reveal hear nothing out of place. */
const LATE_SECONDS = 0.3

let context: AudioContext | null | undefined
let master: GainNode | null = null
let noise: AudioBuffer | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()
const scheduled = new Set<string>()

/** Creates the audio context and unlocks it on the first gesture, like the question sounds. */
export function prepareGachaponAudio() {
	if (context !== undefined) return context
	try { context = new AudioContext({ latencyHint: 'interactive' }) }
	catch { context = null; return null }
	master = context.createGain()
	master.gain.value = 0.6
	master.connect(context.destination)
	const unlock = () => { if (context?.state === 'suspended' && !document.hidden) void context.resume().catch(() => {}) }
	// Touch-end also covers Safari's stricter audio activation policy.
	for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, unlock, true)
	unlock()
	return context
}

function running() {
	const audio = prepareGachaponAudio()
	return audio && master && audio.state === 'running' && !document.hidden ? audio : null
}

function load(url: string) {
	let buffer = buffers.get(url)
	if (!buffer) {
		const audio = prepareGachaponAudio()
		buffer = audio
			? fetch(url).then((response) => (response.ok ? response.arrayBuffer() : Promise.reject())).then((data) => audio.decodeAudioData(data)).catch(() => null)
			: Promise.resolve(null)
		buffers.set(url, buffer)
	}
	return buffer
}

function playFile(url: string, delay: number, volume: number) {
	const audio = running()
	if (!audio) return
	const at = audio.currentTime + Math.max(0, delay)
	void load(url).then((buffer) => {
		// Never play a sound long after its moment because of a slow download.
		if (!buffer || audio.state !== 'running' || audio.currentTime > at + LATE_SECONDS) return
		const source = audio.createBufferSource(), gain = audio.createGain()
		source.buffer = buffer
		gain.gain.value = volume
		source.connect(gain).connect(master!)
		source.onended = () => { source.disconnect(); gain.disconnect() }
		source.start(Math.max(at, audio.currentTime))
	})
}

function tone(audio: AudioContext, at: number, frequency: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
	const oscillator = audio.createOscillator(), gain = audio.createGain()
	oscillator.type = type
	oscillator.frequency.value = frequency
	gain.gain.setValueAtTime(volume, at)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
	oscillator.connect(gain).connect(master!)
	oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
	oscillator.start(at)
	oscillator.stop(at + duration)
}

function click(audio: AudioContext, at: number, frequency: number, volume: number) {
	if (!noise) {
		noise = audio.createBuffer(1, Math.round(audio.sampleRate * 0.03), audio.sampleRate)
		const data = noise.getChannelData(0)
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
	}
	const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain()
	source.buffer = noise
	filter.type = 'bandpass'
	filter.frequency.value = frequency
	filter.Q.value = 3
	gain.gain.value = volume
	source.connect(filter).connect(gain).connect(master!)
	source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
	source.start(at)
}

/** A metallic "cling" when this viewer inserts a coin. */
export function playCoin() {
	const audio = running()
	if (!audio) return
	const at = audio.currentTime + 0.01
	tone(audio, at, 1568, 0.25, 0.3)
	tone(audio, at + 0.07, 2349, 0.3, 0.2, 'sine')
	tone(audio, at + 0.16, 1319, 0.4, 0.16)
}

/** Lever ratchet, capsules knocking, capsule pop and card shimmer, aligned with the shared start. */
export function scheduleSpinSounds(resultId: string, startedAt: number) {
	if (scheduled.has(resultId)) return
	scheduled.add(resultId)
	if (scheduled.size > 32) scheduled.delete(scheduled.values().next().value!)
	const audio = running()
	if (!audio) return
	const elapsed = (Date.now() - startedAt) / 1000
	const at = (moment: number) => audio.currentTime + moment - elapsed
	const due = (moment: number) => moment - elapsed > -LATE_SECONDS
	for (let i = 0; i < 6; i++) if (due(i * 0.05)) click(audio, Math.max(audio.currentTime, at(i * 0.05)), 2600, 0.5 - i * 0.05)
	for (let i = 0; i < 9; i++) {
		const moment = 0.3 + ((i * 0.37) % 1)
		if (due(moment)) click(audio, Math.max(audio.currentTime, at(moment)), 900 + (i % 3) * 250, 0.28)
	}
	if (due(SPIN_MOMENTS.burst)) {
		playFile(popUrl, SPIN_MOMENTS.burst - elapsed, 0.9)
		playFile(confettiUrl, SPIN_MOMENTS.burst - elapsed, 0.45)
	}
	if (due(SPIN_MOMENTS.card)) playFile(celebrateUrl, SPIN_MOMENTS.card - elapsed, 0.7)
}
