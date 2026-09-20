import { useEffect, useState } from 'react'
import { navigate } from '../navigation'

export const boardViewPath = (view: string) => view === 'all' ? '/' : `/?view=${encodeURIComponent(view)}`

export function useBoardView() {
	const read = () => new URLSearchParams(location.search).get('view') || 'all'
	const [view, setView] = useState(read)
	useEffect(() => {
		const update = () => setView(read())
		window.addEventListener('popstate', update)
		window.addEventListener('xp-navigation', update)
		return () => { window.removeEventListener('popstate', update); window.removeEventListener('xp-navigation', update) }
	}, [])
	return [view, (next: string) => navigate(boardViewPath(next))] as const
}
