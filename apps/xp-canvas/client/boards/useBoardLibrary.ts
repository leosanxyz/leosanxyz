import { useCallback, useEffect, useState } from 'react'
import type { BoardLibrary } from '../../shared/boards'
import { usePortal } from '../portal/PortalProvider'
import { boardRequest } from './api'

// The last library each account saw, so a section that mounts shows its sidebar at once and refreshes behind it.
const remembered = new Map<string, BoardLibrary>()
export const libraryKey = (userId?: string) => userId ?? 'local'
export const rememberedLibrary = (key: string) => remembered.get(key) ?? null
export const rememberLibrary = (key: string, library: BoardLibrary) => { remembered.set(key, library) }

export function useBoardLibrary() {
	const key = libraryKey(usePortal().user?.id)
	const [library, setLibrary] = useState(() => rememberedLibrary(key)), [error, setError] = useState('')
	const load = useCallback(async (signal?: AbortSignal) => {
		try {
			const result = await boardRequest<BoardLibrary>('library', 'GET', undefined, signal)
			if (!signal?.aborted) { rememberLibrary(key, result); setLibrary(result); setError('') }
		} catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No pude cargar tus canvases.') }
	}, [key])
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
