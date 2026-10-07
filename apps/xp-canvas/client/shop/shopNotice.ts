import { useCallback, useEffect, useState } from 'react'
import { shopSlot } from '../../shared/shop'

const SEEN_EVENT = 'xp-shop-seen'
const key = (userId: string) => `xp-shop-seen:${userId}`
function read(userId?: string) {
	if (!userId) return false
	try { return localStorage.getItem(key(userId)) !== shopSlot() } catch { return false }
}

/** True while this student has not opened the shop since its last rotation. Stored only in this browser. */
export function useShopNotice(userId?: string) {
	const [hasNews, setHasNews] = useState(() => read(userId))
	useEffect(() => {
		const update = () => setHasNews(read(userId))
		update()
		// The pool can rotate while the tab stays open.
		const interval = window.setInterval(update, 60_000)
		window.addEventListener('focus', update)
		window.addEventListener('storage', update)
		window.addEventListener(SEEN_EVENT, update)
		document.addEventListener('visibilitychange', update)
		return () => {
			clearInterval(interval)
			window.removeEventListener('focus', update)
			window.removeEventListener('storage', update)
			window.removeEventListener(SEEN_EVENT, update)
			document.removeEventListener('visibilitychange', update)
		}
	}, [userId])
	const markSeen = useCallback(() => {
		if (!userId) return
		try { localStorage.setItem(key(userId), shopSlot()) } catch { /* Private mode: the dot stays. */ }
		window.dispatchEvent(new Event(SEEN_EVENT))
	}, [userId])
	return { hasNews, markSeen }
}
