import { useEffect, useRef, useState } from 'react'
import { DRAW_DURATION, DRAW_TIMES, drawStudentAt, type StudentDraw } from '../../shared/studentDraw'

// How long the chosen student stays highlighted after the final beat.
const WINNER_HOLD = 5000

export function useStudentDraw(draw: StudentDraw | null, enabled: boolean) {
	const [step, setStep] = useState(-1)
	const tick = useRef<(final: boolean) => void>(() => {})
	useEffect(() => {
		if (!enabled) return
		let audio: AudioContext
		try { audio = new AudioContext({ latencyHint: 'interactive' }) } catch { return }
		const unlock = () => { if (!document.hidden && audio.state === 'suspended') void audio.resume().catch(() => {}) }
		for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, unlock, true)
		unlock()
		tick.current = (final) => {
			if (document.hidden || audio.state !== 'running') return
			const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime
			oscillator.type = 'sine'
			oscillator.frequency.value = final ? 1046 : 720
			gain.gain.setValueAtTime(0, now)
			gain.gain.linearRampToValueAtTime(final ? .045 : .025, now + .003)
			gain.gain.exponentialRampToValueAtTime(.0001, now + (final ? .24 : .035))
			oscillator.connect(gain); gain.connect(audio.destination)
			oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
			oscillator.start(now); oscillator.stop(now + (final ? .25 : .04))
		}
		return () => {
			tick.current = () => {}
			for (const event of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(event, unlock, true)
			void audio.close().catch(() => {})
		}
	}, [enabled])
	useEffect(() => {
		setStep(-1)
		if (!draw) return
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
		let timer: ReturnType<typeof setTimeout>
		let last = -1
		const update = () => {
			const elapsed = Date.now() - draw.startedAt
			// Step 24 means the draw is over and nobody is highlighted.
			if (elapsed >= DRAW_DURATION + WINNER_HOLD) { setStep(24); return }
			let current = -1
			while (current < 23 && DRAW_TIMES[current + 1] <= elapsed) current++
			if (current !== last) {
				setStep(reduced.matches && current < 23 ? -1 : current)
				// Skip missed beats when a background tab wakes up.
				if (current >= 0 && elapsed - DRAW_TIMES[current] < 150) tick.current(current === 23)
				last = current
			}
			timer = setTimeout(update, Math.max(1, (current < 23 ? DRAW_TIMES[current + 1] : DRAW_DURATION + WINNER_HOLD) - elapsed))
		}
		update()
		return () => clearTimeout(timer)
	}, [draw])
	return { activeId: draw && step >= 0 && step <= 23 ? drawStudentAt(draw, step) : null, running: Boolean(draw && step < 23), finished: Boolean(draw && step === 23) }
}
