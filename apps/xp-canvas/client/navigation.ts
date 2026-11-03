import { startTransition, useEffect, useState } from 'react'
import type { Board } from '../shared/boards'

export function navigate(path: string, state: unknown = null) {
	if (location.pathname + location.search === path) return
	if (!window.dispatchEvent(new Event('xp-before-navigation', { cancelable: true }))) return
	history.pushState(state, '', path)
	window.dispatchEvent(new Event('xp-navigation'))
}

export function usePathname() {
	const [path, setPath] = useState(location.pathname)
	useEffect(() => {
		// A transition keeps the current page on screen while the next one loads its code.
		const update = () => startTransition(() => setPath(location.pathname))
		window.addEventListener('popstate', update)
		window.addEventListener('xp-navigation', update)
		return () => { window.removeEventListener('popstate', update); window.removeEventListener('xp-navigation', update) }
	}, [])
	return path
}

/** What the canvas skeleton needs before the board arrives. History keeps it, so a reload draws the same shape. */
export interface CanvasHint { name: string; personal: boolean }

export function openCanvas(board: Board) {
	navigate(`/board/${board.id}`, { name: board.name, personal: Boolean(board.ownerId) } satisfies CanvasHint)
}

export function canvasHint(): Partial<CanvasHint> {
	const state: unknown = history.state
	return state && typeof state === 'object' ? state : {}
}
