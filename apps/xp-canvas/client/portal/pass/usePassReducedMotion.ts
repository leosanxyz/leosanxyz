import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
function subscribe(change: () => void) {
	const media = window.matchMedia(query)
	media.addEventListener('change', change)
	return () => media.removeEventListener('change', change)
}
const snapshot = () => window.matchMedia(query).matches

// Motion 13's hook snapshots this preference on mount. The pass also responds
// when the student changes their system preference with the page already open.
export function usePassReducedMotion() {
	return useSyncExternalStore(subscribe, snapshot, () => false)
}
