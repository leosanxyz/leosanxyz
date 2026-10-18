import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

// The morphing marker of leosan.xyz's home list: same twelve-point shapes, so clip-path can morph between any two.
const SHAPES = {
	red: { color: 'var(--xp-red)', clipPath: 'polygon(0% 0%, 33% 0%, 67% 0%, 100% 0%, 100% 33%, 100% 67%, 100% 100%, 67% 100%, 33% 100%, 0% 100%, 0% 67%, 0% 33%)' },
	green: { color: 'var(--xp-green)', clipPath: 'polygon(50% 0%, 75% 7%, 93% 25%, 100% 50%, 93% 75%, 75% 93%, 50% 100%, 25% 93%, 7% 75%, 0% 50%, 7% 25%, 25% 7%)' },
	yellow: { color: 'var(--xp-yellow)', clipPath: 'polygon(50% 0%, 63% 25%, 75% 50%, 88% 75%, 100% 100%, 75% 100%, 50% 100%, 25% 100%, 0% 100%, 13% 75%, 25% 50%, 38% 25%)' },
	indigo: { color: 'var(--xp-indigo)', clipPath: 'polygon(25% 0%, 42% 0%, 58% 0%, 75% 0%, 75% 33%, 75% 67%, 75% 100%, 58% 100%, 42% 100%, 25% 100%, 25% 67%, 25% 33%)' },
} as const
type Tone = keyof typeof SHAPES
interface Spot { y: number; tone: Tone; inList: boolean }

// Each section mounts its own sidebar; the marker starts where the last one left it, so it hops between sections too.
let lastSpot: Spot | null = null

const HOP_MS = 140, INTERRUPTED_HOP_MS = 90
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Marks the current section with a shape that hops and morphs to the next one when a section is chosen. Sections apart from the list, like the shop or the account, get it without the hop. */
export function SidebarIndicator({ current }: { current: string }) {
	const marker = useRef<HTMLSpanElement>(null), hop = useRef<Animation | null>(null)
	const [spot, setSpot] = useState<Spot | null>(lastSpot)
	const [morphing, setMorphing] = useState(false), [visible, setVisible] = useState(false)

	// Choosing a section hops the marker; scrolling or resizing only keeps it beside its section.
	const place = useRef<(hopping: boolean) => void>(() => {})
	place.current = (hopping) => {
		const element = marker.current, root = element?.closest<HTMLElement>('.board-sidebar')
		if (!root || !element) return
		const target = root.querySelector<HTMLElement>('[data-tone][aria-current="page"]')
		const tone = target?.dataset.tone as Tone | undefined
		if (!target || !tone || !(tone in SHAPES)) { setVisible(false); return }
		const box = target.getBoundingClientRect(), base = root.getBoundingClientRect()
		// A folder scrolled out of the navigation keeps the marker hidden rather than floating over the logo.
		const scroller = target.closest('.board-navigation')?.getBoundingClientRect()
		const inView = !scroller || (box.top + box.height / 2 >= scroller.top && box.top + box.height / 2 <= scroller.bottom)
		const next = { y: box.top - base.top + box.height / 2, tone, inList: Boolean(scroller) }
		const previous = lastSpot
		hopping = hopping && Boolean(previous?.inList && next.inList)
		if (hopping && previous && Math.abs(previous.y - next.y) > 1 && !reducedMotion()) {
			const from = new DOMMatrixReadOnly(getComputedStyle(element).transform === 'none' ? undefined : getComputedStyle(element).transform)
			const half = element.offsetHeight / 2, endY = next.y - half
			hop.current?.cancel()
			const animation = element.animate([
				{ transform: `translate3d(${from.m41}px, ${from.m42}px, 0)` },
				{ transform: `translate3d(-6px, ${from.m42 + (endY - from.m42) / 2 - 7}px, 0)`, offset: .5 },
				{ transform: `translate3d(0, ${endY}px, 0)` },
			], { duration: hop.current ? INTERRUPTED_HOP_MS : HOP_MS, easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)' })
			hop.current = animation
			animation.onfinish = () => { if (hop.current === animation) hop.current = null }
		}
		setMorphing(hopping && Boolean(previous && previous.tone !== next.tone))
		lastSpot = next
		setSpot(next)
		setVisible(inView)
	}

	useLayoutEffect(() => { place.current(true) }, [current])

	useEffect(() => {
		const root = marker.current?.closest<HTMLElement>('.board-sidebar')
		if (!root) return
		const reposition = () => place.current(false)
		const navigation = root.querySelector('.board-navigation')
		navigation?.addEventListener('scroll', reposition, { passive: true })
		window.addEventListener('resize', reposition)
		return () => {
			hop.current?.cancel()
			navigation?.removeEventListener('scroll', reposition)
			window.removeEventListener('resize', reposition)
		}
	}, [])

	const shape = SHAPES[spot?.tone ?? 'red']
	return <span ref={marker} className="board-indicator" aria-hidden="true" data-visible={visible && spot !== null} data-morphing={morphing}
		style={{ '--indicator-y': `${spot?.y ?? 0}px` } as CSSProperties}>
		<span className="board-indicator__shape" style={{ backgroundColor: shape.color, clipPath: shape.clipPath }} />
	</span>
}
