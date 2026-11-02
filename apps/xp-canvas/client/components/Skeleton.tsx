import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { RevealSpec } from 'skullet'
import { Skeleton, SkulletProvider } from 'skullet/react'
import type { Board } from '../../shared/boards'
import type { AgentGrant, Roster } from '../../shared/portal'
import { usePathname } from '../navigation'
import { XpLogo } from './XpLogo'
import '../boards/boards.css'
import '../resources/resources.css'

// Skullet draws every skeleton from the shape of the content it stands in for: a bar for each line of text,
// a block for each image, control or element marked `skullet-block`. Lists wrap their real markup in
// `<Skeleton data sample>`; the page shapes below are the same markup filled with sample text.

const theme = { light: { base: '#eceff3', highlight: 'rgb(255 255 255 / 0.6)' } }

const STAGGER_MS = 40
/**
 * Lists arrive one item after another, left to right and top to bottom, each rising a little; a skeleton
 * leaves the same way. Skullet calls an item a unit: a card or a row with siblings like it. Smaller text
 * comes a beat behind its title. Always staggered, even for a fast load, so the entrance never changes.
 */
const reveal: RevealSpec = {
	duration: 600,
	enter: { translate: '0 6px' },
	order: ({ unit, reveal, secondary }) => {
		if (!unit) return 0
		const columns = Math.max(Math.round(reveal.width / unit.width), 1)
		const index = Math.round((unit.top - reveal.top) / unit.height) * columns + Math.round((unit.left - reveal.left) / unit.width)
		return Math.min(index, 6) * STAGGER_MS + (secondary ? STAGGER_MS : 0)
	},
}

export function SkeletonProvider({ children }: { children: ReactNode }) {
	return <SkulletProvider theme={theme} mode="light" reveal={reveal}>{children}</SkulletProvider>
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index)
const day = Date.UTC(2026, 9, 12)

/** As many cards as fit in a row; real cards past them arrive with the rest. */
export const SAMPLE_BOARDS: Board[] = ['Principal', 'Diagramas de flujo', 'Variables y tipos', 'Proyecto final'].map((name, index) => ({
	id: `sample-${index}`, name, folderId: null, favorite: false, createdAt: day, updatedAt: day, thumbnailAt: null, trashedAt: null,
}))

export const SAMPLE_ROSTER: Roster = {
	groups: [{ id: 'sample-group', name: 'Grupo A' }],
	students: ['Ana López Hernández', 'Luis Pérez', 'María Fernanda Ruiz', 'Diego Torres'].map((name, index) => ({
		id: `sample-${index}`, username: `A0123456${index}`, name, role: 'student', mustChangePassword: false, points: 1250, groupId: null, disabled: false,
	})),
	canvases: [],
}

export const SAMPLE_AGENTS: AgentGrant[] = [{ id: 'sample', client: 'Codex', createdAt: day, lastUsedAt: day }]

export { Skeleton }

/** A dialog's student checklist while the roster loads, for `<Skeleton loading>`. */
export function SampleChecklist({ className }: { className: string }) {
	return <div className={className}>{SAMPLE_ROSTER.students.map((student) => <label key={student.id}><input type="checkbox" />{student.name}</label>)}</div>
}

/**
 * A page shape. When it unmounts, a copy of it stays in place and fades out over whatever replaced it,
 * so the swap is a crossfade with no empty frame in between. Skullet only crossfades inside one `<Skeleton>`,
 * and these shapes give way to other components. `hold` keeps it in front of content that still prepares itself.
 */
export function PageSkeleton({ children, className, leaveDelay = 0, hold, label }: { children: ReactNode; className?: string; leaveDelay?: number; hold?: Promise<unknown>; label?: string }) {
	const ref = useRef<HTMLDivElement>(null)
	const holdRef = useRef(hold)
	holdRef.current = hold
	useLayoutEffect(() => {
		const element = ref.current
		// Layout cleanups run while the shape is still in the document, before the content takes its place.
		return () => { if (element?.isConnected) leave(element, leaveDelay, holdRef.current) }
	}, [leaveDelay])
	return <div ref={ref} className={className}><Skeleton loading label={label}>{children}</Skeleton></div>
}

// Longest a shape waits in front of content that is still preparing itself.
const HOLD_MS = 1500

function leave(element: HTMLElement, delay: number, hold?: Promise<unknown>) {
	const rect = element.getBoundingClientRect()
	if (!rect.width || !rect.height) return
	const ghost = element.cloneNode(true) as HTMLElement
	// Skullet draws its bars in a shadow root, which cloning leaves behind; copy them where the shimmer is now.
	const layers = element.querySelectorAll('[skullet-layer]'), copies = ghost.querySelectorAll('[skullet-layer]')
	layers.forEach((layer, index) => {
		if (!layer.shadowRoot) return
		const shadow = copies[index].attachShadow({ mode: 'open' })
		for (const bar of layer.shadowRoot.children) {
			const copy = shadow.appendChild(bar.cloneNode(true)) as HTMLElement
			copy.style.backgroundPosition = getComputedStyle(bar).backgroundPosition
		}
	})
	ghost.classList.add('skeleton-ghost')
	ghost.setAttribute('aria-hidden', 'true')
	Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', animationDelay: `${delay}ms` })
	document.body.appendChild(ghost)
	let removed = false
	const remove = () => {
		if (removed) return
		removed = true
		ghost.remove()
	}
	ghost.addEventListener('animationend', (event) => { if (event.target === ghost) remove() })
	window.setTimeout(remove, HOLD_MS + 3000)
	// Hold a painted frame before fading, so the heavy frame that mounts the content cannot eat the fade.
	const fade = () => requestAnimationFrame(() => requestAnimationFrame(() => { ghost.dataset.leaving = 'true' }))
	// Content that still prepares itself after mounting (the shop's 3D machine) keeps the shape in front until it is ready.
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

/** Entrance of data that was loading, for content without a skeleton of its own. */
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

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

/** The cards as a library draws them; `skullet-ignore` on the real card's menu keeps the two shapes equal. */
function SampleCards() {
	return SAMPLE_BOARDS.map((board) => <div key={board.id} className="board-card">
		<div className="board-card-preview" />
		<div className="board-card-caption"><strong>{board.name}</strong><time>{dateFormat.format(board.updatedAt)}</time></div>
	</div>)
}

/** The library while it loads: sidebar, title and, for the canvas list, a row of cards. The logo never changes, so it shows as itself. */
export function LibrarySkeleton({ cards = false }: { cards?: boolean }) {
	return <PageSkeleton className="skeleton-page">
		<main className="board-manager">
			<aside className="board-sidebar">
				<div className="board-sidebar-heading" skullet-own=""><XpLogo size={36} /></div>
				<div className="board-navigation">{['Todos', 'Recientes', 'Favoritos'].map((name) => <div key={name} className="board-nav-item"><span>{name}</span></div>)}</div>
				<div className="board-account-trigger"><span className="board-account-name">Mi cuenta</span></div>
			</aside>
			<section className="board-main">
				<header className="board-header"><span className="skeleton-trigger" skullet-block="" /><h1>Mis canvases</h1></header>
				{cards ? <div className="board-grid"><SampleCards /></div> : <div className="skeleton-panel" skullet-block="" />}
			</section>
		</main>
	</PageSkeleton>
}

/** The canvas header while the board loads; the stage stays empty until the document arrives. */
export function CanvasSkeleton() {
	return <PageSkeleton className="skeleton-page">
		<div className="canvas-room">
			<header className="canvas-header">
				<div className="canvas-identity"><span className="skeleton-button" skullet-block="" /><span className="canvas-board-title">Principal</span></div>
				<div className="canvas-actions"><span className="skeleton-action" skullet-block="" /><span className="skeleton-action" skullet-block="" /></div>
			</header>
		</div>
	</PageSkeleton>
}

export function ResourcesSkeleton() {
	return <PageSkeleton className="skeleton-overlay">
		<aside className="resource-library">
			<div className="resource-library__heading"><h2>Recursos</h2></div>
			<span className="resource-upload" skullet-block="" />
			<div className="resource-library__list">{range(4).map((index) => <span key={index} className="skeleton-tile" skullet-block="" />)}</div>
		</aside>
	</PageSkeleton>
}

/** A block standing in for a page's main content. */
export function PanelSkeleton() {
	return <PageSkeleton><div className="skeleton-panel" skullet-block="" /></PageSkeleton>
}

/** While the session is checked, show the shape of the page the address leads to. */
export function RouteSkeleton() {
	const path = usePathname()
	if (path.startsWith('/board/')) return <CanvasSkeleton />
	if (['/', '/perfil', '/mi-pase', '/tienda', '/alumnos'].includes(path)) return <LibrarySkeleton cards={path === '/'} />
	return null
}
