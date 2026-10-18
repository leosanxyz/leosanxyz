import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { usePathname } from '../navigation'
import '../boards/boards.css'
import '../resources/resources.css'

// Skeletons reuse the classes of the page they stand in for, so the layout does not move when content arrives.
const range = (count: number) => Array.from({ length: count }, (_, index) => index)

const SHIMMER_MS = 1800
// Skeletons and their ghosts on screen. A skeleton that replaces another one appears at once instead of fading in again.
let skeletonsOnScreen = 0
// Every skeleton shimmers in the same phase, so swapping one for another does not make the highlight jump.
export const shimmerPhase = () => `${-Math.round(performance.now() % SHIMMER_MS)}ms`

/**
 * Root of a skeleton. When it unmounts, a copy of it stays in place and fades out over the content
 * that replaced it, so the swap is a crossfade with no empty frame in between.
 */
export function useSkeleton<T extends HTMLElement>(leaveDelay = 0, hold?: Promise<unknown>) {
	const ref = useRef<T>(null)
	const holdRef = useRef(hold)
	holdRef.current = hold
	const [quiet] = useState(() => skeletonsOnScreen > 0)
	const [style] = useState(() => ({ '--skeleton-phase': shimmerPhase() }) as CSSProperties)
	useLayoutEffect(() => {
		const element = ref.current
		skeletonsOnScreen++
		return () => {
			skeletonsOnScreen--
			// Layout cleanups run while the skeleton is still in the document, before the content takes its place.
			// A skeleton inside another one leaves with it.
			if (element?.isConnected && !element.parentElement?.closest('[data-skeleton]')) leave(element, leaveDelay, holdRef.current)
		}
	}, [leaveDelay])
	return { ref, style, 'data-skeleton': '', 'data-skeleton-quiet': quiet || undefined }
}

// Sibling skeletons are removed one at a time, and each removal shifts the rest into its place.
// The first one to leave measures them all, so every ghost stays over its own spot.
let measured: WeakMap<Element, DOMRect> | null = null

function measure(element: HTMLElement) {
	if (!measured) {
		measured = new WeakMap()
		// The whole commit removes them synchronously; the next one measures again.
		queueMicrotask(() => { measured = null })
	}
	for (const sibling of element.parentElement?.children ?? []) {
		if (sibling.hasAttribute('data-skeleton') && !measured.has(sibling)) measured.set(sibling, sibling.getBoundingClientRect())
	}
	return measured.get(element) ?? element.getBoundingClientRect()
}

// Longest a skeleton waits in front of content that is still preparing itself.
const HOLD_MS = 1500

function leave(element: HTMLElement, delay: number, hold?: Promise<unknown>) {
	const rect = measure(element)
	if (!rect.width || !rect.height) return
	const ghost = element.cloneNode(true) as HTMLElement
	ghost.classList.add('skeleton-ghost')
	ghost.setAttribute('aria-hidden', 'true')
	ghost.removeAttribute('aria-busy')
	Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', animationDelay: `${delay}ms` })
	ghost.style.setProperty('--skeleton-phase', shimmerPhase())
	skeletonsOnScreen++
	document.body.appendChild(ghost)
	let removed = false
	const remove = () => {
		if (removed) return
		removed = true
		ghost.remove()
		skeletonsOnScreen--
	}
	ghost.addEventListener('animationend', (event) => { if (event.target === ghost) remove() })
	window.setTimeout(remove, HOLD_MS + 3000)
	// Hold a painted frame before fading, so the heavy frame that mounts the content cannot eat the fade.
	const fade = () => requestAnimationFrame(() => requestAnimationFrame(() => { ghost.dataset.leaving = 'true' }))
	// Content that still prepares itself after mounting (the shop's 3D machine) keeps the skeleton in front until it is ready.
	if (hold) void Promise.race([hold, new Promise((resolve) => window.setTimeout(resolve, HOLD_MS))]).then(fade)
	else fade()
}

// Content without a skeleton of its own fades in for this long; content that was already there never does.
const REVEAL_MS = 1000
// `pending` paints the content once while hidden; the fade runs from the next frame, so a heavy first frame cannot eat its start.
type Reveal = 'waiting' | 'pending' | 'running' | 'done'
export type RevealState = 'pending' | 'running' | undefined

function useRevealState(initial: Reveal) {
	const [reveal, setReveal] = useState<Reveal>(initial)
	useEffect(() => {
		if (reveal === 'pending') {
			let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setReveal('running')) })
			return () => cancelAnimationFrame(frame)
		}
		if (reveal !== 'running') return
		const timer = window.setTimeout(() => setReveal('done'), REVEAL_MS)
		return () => clearTimeout(timer)
	}, [reveal])
	return [reveal, setReveal] as const
}

const revealState = (reveal: Reveal): RevealState => reveal === 'pending' || reveal === 'running' ? reveal : undefined

/** Entrance of data that was loading. */
export function useReveal(ready: boolean) {
	const [reveal, setReveal] = useRevealState(ready ? 'done' : 'waiting')
	// Set during render so the content is hidden from its very first frame.
	if (ready && reveal === 'waiting') setReveal('pending')
	return revealState(reveal)
}

/** Entrance of content that takes the place of other content already on screen, such as a new section. */
export function useEnterReveal(enabled: boolean) {
	return revealState(useRevealState(enabled ? 'pending' : 'done')[0])
}

/** Inline delay for the item at `index` of a list that enters in sequence. */
export const revealDelay = (reveal: RevealState, index: number) => reveal ? { animationDelay: `${Math.min(index, 6) * 40}ms` } : undefined

/** The library while it loads: sidebar, title and, for the canvas list, a row of cards. */
export function LibrarySkeleton({ cards = false }: { cards?: boolean }) {
	const skeleton = useSkeleton<HTMLElement>()
	return <main className="board-manager" aria-busy="true" {...skeleton}>
		<aside className="board-sidebar">
			<div className="board-sidebar-heading"><span className="xp-skeleton skeleton-heading" /></div>
			<div className="board-navigation">{range(3).map((index) => <div key={index} className="board-nav-item"><span className="xp-skeleton skeleton-icon" /><span className="xp-skeleton skeleton-label" /></div>)}</div>
			<div className="board-account-trigger"><span className="xp-skeleton skeleton-avatar" /><span className="xp-skeleton skeleton-label" /></div>
		</aside>
		<section className="board-main">
			<header className="board-header"><span className="xp-skeleton skeleton-trigger" /><span className="xp-skeleton skeleton-title" /></header>
			{cards ? <div className="board-grid"><BoardCardsSkeleton /></div> : <div className="xp-skeleton skeleton-panel" />}
		</section>
	</main>
}

/** As many cards as fit in a row; real cards past them fade in on their own. */
export const SKELETON_CARDS = 4

export function BoardCardsSkeleton() {
	return range(SKELETON_CARDS).map((index) => <SkeletonCard key={index} index={index} />)
}

function SkeletonCard({ index }: { index: number }) {
	// The cards leave one after another, the way the real ones would arrive.
	const skeleton = useSkeleton<HTMLDivElement>(index * 40)
	return <div className="board-card" aria-hidden="true" {...skeleton}>
		<div className="board-card-preview"><span className="xp-skeleton skeleton-fill" /></div>
		<div className="board-card-caption"><span className="xp-skeleton skeleton-label" /><span className="xp-skeleton skeleton-date" /></div>
	</div>
}

/** The canvas header while the board loads; the stage stays empty until the document arrives. */
export function CanvasSkeleton() {
	const skeleton = useSkeleton<HTMLDivElement>()
	return <div className="canvas-room" aria-busy="true" {...skeleton}>
		<header className="canvas-header">
			<div className="canvas-identity"><span className="xp-skeleton skeleton-button" /><span className="xp-skeleton skeleton-label" /></div>
			<div className="canvas-actions"><span className="xp-skeleton skeleton-action" /><span className="xp-skeleton skeleton-action" /></div>
		</header>
	</div>
}

export function ResourcesSkeleton() {
	const skeleton = useSkeleton<HTMLElement>()
	return <aside className="resource-library" aria-busy="true" {...skeleton}>
		<span className="xp-skeleton skeleton-label" />
		<span className="xp-skeleton skeleton-upload" />
		<div className="resource-library__list">{range(4).map((index) => <span key={index} className="xp-skeleton skeleton-tile" />)}</div>
	</aside>
}

/** A block standing in for a page's main content. */
export function PanelSkeleton() {
	const skeleton = useSkeleton<HTMLDivElement>()
	return <div className="xp-skeleton skeleton-panel" aria-busy="true" {...skeleton} />
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
	const skeleton = useSkeleton<HTMLDivElement>()
	return <div className="skeleton-lines" aria-busy="true" {...skeleton}>{range(count).map((index) => <span key={index} className="xp-skeleton skeleton-line" />)}</div>
}

/** While the session is checked, show the shape of the page the address leads to. */
export function RouteSkeleton() {
	const path = usePathname()
	if (path.startsWith('/board/')) return <CanvasSkeleton />
	if (['/', '/perfil', '/mi-pase', '/tienda', '/alumnos'].includes(path)) return <LibrarySkeleton cards={path === '/'} />
	return null
}
