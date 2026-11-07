import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ObsVista } from '../../shared/obs'
import { boardRequest } from '../boards/api'

export interface ObsState { vista: ObsVista; irA: (capitulo: number) => Promise<void> }
export const ObsContext = createContext<ObsState | null>(null)
export const useObsContext = () => useContext(ObsContext)

const OFFLINE: ObsVista = { obs: false }

/** Follows the OBS relay. Until the socket answers, and while it reconnects, OBS counts as not connected. */
export function useObs(enabled: boolean, onError: (message: string) => void): ObsState {
	const [vista, setVista] = useState<ObsVista>(OFFLINE)
	useEffect(() => {
		if (!enabled) return
		let socket: WebSocket | null = null, retry = 0, timer = 0, closed = false
		const open = () => {
			socket = new WebSocket(new URL('/api/obs/estado', location.href.replace(/^http/, 'ws')))
			socket.onmessage = (event) => { retry = 0; try { setVista(JSON.parse(event.data) as ObsVista) } catch { /* ignore */ } }
			socket.onclose = () => {
				setVista(OFFLINE)
				if (!closed) timer = window.setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++))
			}
		}
		open()
		return () => { closed = true; clearTimeout(timer); socket?.close() }
	}, [enabled])
	const irA = useCallback(async (capitulo: number) => {
		try { await boardRequest('obs/capitulo', 'POST', { capitulo }) }
		catch (cause) { onError(cause instanceof Error ? cause.message : 'OBS no respondió.') }
	}, [onError])
	return useMemo(() => ({ vista, irA }), [vista, irA])
}
