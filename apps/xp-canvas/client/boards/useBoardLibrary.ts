import { useCallback, useEffect, useState } from 'react'
import type { BoardLibrary } from '../../shared/boards'
import { boardRequest } from './api'

export function useBoardLibrary() {
	const [library, setLibrary] = useState<BoardLibrary | null>(null), [error, setError] = useState('')
	const load = useCallback(async (signal?: AbortSignal) => {
		try {
			const result = await boardRequest<BoardLibrary>('library', 'GET', undefined, signal)
			if (!signal?.aborted) { setLibrary(result); setError('') }
		} catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No pude cargar tus canvases.') }
	}, [])
	useEffect(() => {
		const abort = new AbortController()
		void load(abort.signal)
		const check = () => { if (!document.hidden) void load(abort.signal) }
		const interval = window.setInterval(check, 30_000)
		window.addEventListener('focus', check)
		document.addEventListener('visibilitychange', check)
		return () => { abort.abort(); clearInterval(interval); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
	}, [load])
	return { library, error, reload: () => load() }
}
