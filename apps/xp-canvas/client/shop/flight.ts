const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * Flies `content` from one box to another on top of the page, along a curve bent toward `bend` (px from the start).
 * It only moves `transform` and `opacity`, and resolves when it lands.
 */
export function fly(content: HTMLElement, from: DOMRect, to: DOMRect, { duration = 700, delay = 0, bend = { x: 0, y: -90 }, scale = 0.6 } = {}) {
	const start = center(from), end = center(to)
	const control = { x: bend.x, y: bend.y }, target = { x: end.x - start.x, y: end.y - start.y }
	const flight = document.createElement('div')
	flight.className = 'shop-flight'
	flight.setAttribute('aria-hidden', 'true')
	flight.style.left = `${start.x}px`
	flight.style.top = `${start.y}px`
	flight.appendChild(content)
	document.body.appendChild(flight)
	// A quadratic Bézier sampled into keyframes: WAAPI interpolates straight lines between them.
	const frames = Array.from({ length: 21 }, (_, i) => {
		const t = easeInOut(i / 20), u = 1 - t
		const x = 2 * u * t * control.x + t * t * target.x, y = 2 * u * t * control.y + t * t * target.y
		return { transform: `translate(${x}px, ${y}px) scale(${1 + (scale - 1) * t})`, opacity: i === 20 ? 0 : 1 }
	})
	const animation = flight.animate(frames, { duration, delay, easing: 'linear', fill: 'both' })
	return animation.finished.catch(() => {}).finally(() => flight.remove())
}
