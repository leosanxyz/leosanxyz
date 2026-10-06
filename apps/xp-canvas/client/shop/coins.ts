const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
const COIN = 18
/** Burst and hover; the first coin leaves for the counter at this time. */
export const COINS_FLY_AT = 900

/**
 * Coins burst out of `origin`, hover for a moment, then fly one after another in an arc into `target`.
 * Only `transform` and `opacity` move. `onLand` runs as each coin arrives; the promise resolves with the last one.
 */
export function flyCoins(origin: DOMRect, target: DOMRect, count: number, spread: number, onLand?: (i: number) => void): Promise<void> {
	const start = center(origin), end = center(target)
	const flights = Array.from({ length: count }, (_, i) => {
		const coin = document.createElement('span')
		coin.className = 'shop-coin shop-flight__coin'
		coin.setAttribute('aria-hidden', 'true')
		coin.style.left = `${start.x - COIN / 2}px`
		coin.style.top = `${start.y - COIN / 2}px`
		document.body.appendChild(coin)
		const angle = (-90 + (i - (count - 1) / 2) * (spread / count)) * Math.PI / 180, distance = 70 + (i % 3) * 22
		// The hover bobs from 4px above the resting point, so the burst ends and the flight begins there.
		// Coins from a card at the edge of the window hover just inside it.
		const inside = (value: number, size: number) => Math.min(Math.max(value, COIN), size - COIN)
		const rest = { x: inside(start.x + Math.cos(angle) * distance, innerWidth) - start.x, y: inside(start.y + Math.sin(angle) * distance - 4, innerHeight) - start.y }
		const at = (x: number, y: number, scale = 1) => `translate(${x}px, ${y}px) scale(${scale})`
		const fill = 'forwards' as const, leave = COINS_FLY_AT + i * 45
		coin.animate([{ transform: at(0, 0, 0.4) }, { transform: at(rest.x, rest.y) }], { duration: 380, easing: 'cubic-bezier(.2, .9, .3, 1)', fill })
		coin.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, fill })
		coin.animate([{ transform: at(rest.x, rest.y) }, { transform: at(rest.x, rest.y + 8) }, { transform: at(rest.x, rest.y) }], { duration: 520, delay: 380, easing: 'ease-in-out', fill })
		// A quadratic arc lifted 90px over the midpoint, sampled into keyframes.
		const goal = { x: end.x - start.x, y: end.y - start.y }, control = { x: (rest.x + goal.x) / 2, y: (rest.y + goal.y) / 2 - 90 }
		const path = Array.from({ length: 12 }, (_, k) => {
			const t = k / 11, u = 1 - t
			return { transform: at(u * u * rest.x + 2 * u * t * control.x + t * t * goal.x, u * u * rest.y + 2 * u * t * control.y + t * t * goal.y, 1 - 0.45 * t) }
		})
		const flight = coin.animate(path, { duration: 520, delay: leave, easing: 'cubic-bezier(.55, 0, .8, .2)', fill })
		coin.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520 * 0.15, delay: leave + 520 * 0.85, fill })
		return flight.finished.catch(() => {}).then(() => { coin.remove(); onLand?.(i) })
	})
	return Promise.all(flights).then(() => {})
}
