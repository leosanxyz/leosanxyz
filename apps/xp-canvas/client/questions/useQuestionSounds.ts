import { useCallback, useEffect, useRef } from 'react'
import correctUrl from '../../design/question-sounds/correct.mp3'
import giftUrl from '../../design/question-sounds/1gift-confetti.mp3'
import popUrl from '../../design/question-sounds/confetti-pop-sound.mp3'
import incorrectUrl from '../../design/question-sounds/incorrect.mp3'

export function useQuestionSounds(enabled: boolean) {
	const playRef = useRef<((id: string, correct: boolean) => void) | null>(null)
	useEffect(() => {
		if (!enabled) return
		let context: AudioContext
		try { context = new AudioContext({ latencyHint: 'interactive' }) }
		catch { return }
		const abort = new AbortController(), seen = new Set<string>()
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
		playRef.current = (id, correct) => {
			if (closed || document.hidden || seen.has(id)) return
			seen.add(id)
			if (seen.size > 64) seen.delete(seen.values().next().value!)
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
		}
		// Touch-end also covers Safari's stricter audio activation policy.
		for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, unlock, true)
		document.addEventListener('visibilitychange', visibility)
		unlock()
		return () => {
			closed = true; playRef.current = null; abort.abort(); stop()
			for (const event of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(event, unlock, true)
			document.removeEventListener('visibilitychange', visibility)
			gain.disconnect(); void context.close().catch(() => {})
		}
	}, [enabled])
	return useCallback((id: string, correct: boolean) => playRef.current?.(id, correct), [])
}
