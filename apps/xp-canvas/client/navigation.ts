import { useEffect, useState } from 'react'

export function navigate(path: string) {
	if (location.pathname + location.search === path) return
	if (!window.dispatchEvent(new Event('xp-before-navigation', { cancelable: true }))) return
	history.pushState(null, '', path)
	window.dispatchEvent(new Event('xp-navigation'))
}

export function usePathname() {
	const [path, setPath] = useState(location.pathname)
	useEffect(() => {
		const update = () => setPath(location.pathname)
		window.addEventListener('popstate', update)
		window.addEventListener('xp-navigation', update)
		return () => { window.removeEventListener('popstate', update); window.removeEventListener('xp-navigation', update) }
	}, [])
	return path
}
