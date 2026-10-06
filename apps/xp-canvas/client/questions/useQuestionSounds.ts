import { useCallback, useEffect, useRef } from 'react'
import correctUrl from '../../design/question-sounds/correct.mp3'
import giftUrl from '../../design/question-sounds/1gift-confetti.mp3'
import popUrl from '../../design/question-sounds/confetti-pop-sound.mp3'
import incorrectUrl from '../../design/question-sounds/incorrect.mp3'

type QuestionAudio = { play: (correct: boolean) => void; close: () => void }

/** An audio context with the right and wrong sounds, unlocked on the first gesture. */
function createQuestionAudio(): QuestionAudio | null {
	let context: AudioContext
	try { context = new AudioContext({ latencyHint: 'interactive' }) }
	catch { return null }
	const abort = new AbortController()
	let closed = false, request = 0
	const voices = new Set<AudioBufferSourceNode>()
	const gain = context.createGain()
	gain.gain.value = .65
	gain.connect(context.destination)
	const load = async (url: string) => {
		try {
			const response = await fetch(url, { signal: abort.signal })
			if (!response.ok) return null
			return await context.decodeAudioData(await response.arrayBuffer())
		} catch { return null }
	}
	const buffers = { correct: Promise.all([load(correctUrl), load(giftUrl), load(popUrl)]), incorrect: Promise.all([load(incorrectUrl)]) }
	const stop = () => {
		request++
		for (const source of voices) { source.stop(); source.disconnect() }
		voices.clear()
	}
	const unlock = () => {
		if (!closed && !document.hidden && context.state === 'suspended') void context.resume().catch(() => {})
	}
	const visibility = () => { if (document.hidden) stop() }
	// Touch-end also covers Safari's stricter audio activation policy.
	for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, unlock, true)
	document.addEventListener('visibilitychange', visibility)
	unlock()
	return {
		play(correct) {
			if (closed || document.hidden) return
			stop()
			const current = request, started = performance.now()
			void buffers[correct ? 'correct' : 'incorrect'].then((sequence) => {
				// Never queue a sound behind a blocked audio context or a slow download.
				if (closed || current !== request || document.hidden || context.state !== 'running' || performance.now() - started > 500) return
				// Match the short error's loudness to the combined correct sounds.
				gain.gain.value = correct ? .65 : .21
				const at = context.currentTime + .01
				for (const buffer of sequence) {
					if (!buffer) continue
					const source = context.createBufferSource()
					source.buffer = buffer; source.connect(gain); voices.add(source)
					source.onended = () => { source.disconnect(); voices.delete(source) }
					try { source.start(at) } catch { source.disconnect(); voices.delete(source) }
				}
			})
		},
		close() {
			closed = true; abort.abort(); stop()
			for (const event of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(event, unlock, true)
			document.removeEventListener('visibilitychange', visibility)
			gain.disconnect(); void context.close().catch(() => {})
		},
	}
}

export function useQuestionSounds(enabled: boolean) {
	const playRef = useRef<((id: string, correct: boolean) => void) | null>(null)
	useEffect(() => {
		if (!enabled) return
		const audio = createQuestionAudio()
		if (!audio) return
		const seen = new Set<string>()
		playRef.current = (id, correct) => {
			if (document.hidden || seen.has(id)) return
			seen.add(id)
			if (seen.size > 64) seen.delete(seen.values().next().value!)
			audio.play(correct)
		}
		return () => { playRef.current = null; audio.close() }
	}, [enabled])
	return useCallback((id: string, correct: boolean) => playRef.current?.(id, correct), [])
}

/** The same sounds outside a board, for the shop review. Load them first so the first answer is not silent. */
let shared: QuestionAudio | null | undefined
const sharedAudio = () => shared === undefined ? (shared = createQuestionAudio()) : shared
export function loadQuestionSounds() { sharedAudio() }
export function playCorrect() { sharedAudio()?.play(true) }
export function playIncorrect() { sharedAudio()?.play(false) }
