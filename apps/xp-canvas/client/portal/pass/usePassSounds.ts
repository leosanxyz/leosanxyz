import { useCallback, useEffect, useRef, useState } from 'react'
import { PassAudio, type PassSound } from './PassAudio'

const preference = 'xp-pass-sound-muted'
function readMuted() {
	try {
		return localStorage.getItem(preference) === 'true'
	} catch {
		return false
	}
}

export function usePassSounds() {
	const [muted, setMuted] = useState(readMuted)
	const audio = useRef<PassAudio | null>(null)
	useEffect(() => {
		const engine = new PassAudio()
		let mounted = true
		audio.current = engine
		engine.setMuted(readMuted())
		const visibility = () => {
			if (document.hidden) engine.pause()
		}
		const storage = (event: StorageEvent) => {
			if (event.key !== preference) return
			const value = event.newValue === 'true'
			engine.setMuted(value)
			if (mounted) setMuted(value)
		}
		document.addEventListener('visibilitychange', visibility)
		window.addEventListener('storage', storage)
		return () => {
			mounted = false
			void engine.dispose().finally(() => {
				document.removeEventListener('visibilitychange', visibility)
				window.removeEventListener('storage', storage)
			})
			if (audio.current === engine) audio.current = null
		}
	}, [])
	const unlock = useCallback(() => audio.current?.unlock(), [])
	const play = useCallback((name: PassSound, delay = 0) => {
		void audio.current?.play(name, delay)
	}, [])
	const stop = useCallback(() => audio.current?.stop(), [])
	const tear = useCallback((active: boolean) => {
		audio.current?.setTearing(active)
	}, [])
	const finish = useCallback(async () => {
		audio.current?.stop()
		await audio.current?.play('enter')
	}, [])
	const toggle = useCallback(() => {
		const value = !muted
		audio.current?.setMuted(value)
		if (!value) audio.current?.unlock()
		setMuted(value)
		try {
			localStorage.setItem(preference, String(value))
		} catch {
			/* Private browsing can disable storage. */
		}
	}, [muted])
	return { muted, toggle, unlock, play, stop, tear, finish }
}
