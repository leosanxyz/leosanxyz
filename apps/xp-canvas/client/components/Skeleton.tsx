import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { RevealSpec } from 'skullet'
import { Skeleton, SkulletProvider } from 'skullet/react'
import type { Board } from '../../shared/boards'
import type { AgentGrant, PortalSession, Roster } from '../../shared/portal'
import { canvasHint, usePathname } from '../navigation'
import { Icon } from './Icon'
import { XpLogo } from './XpLogo'
import '../boards/boards.css'
import '../resources/resources.css'
import '../shop/shop.css'
import { CARD } from '../shop/layout'

// Skullet draws every skeleton from the shape of the content it stands in for: a bar for each line of text,
// a block for each image, control or element marked `skullet-block`. Lists wrap their real markup in
// `<Skeleton data sample>`; the page shapes below are the same markup filled with sample text.

const theme = { light: { base: '#eceff3', highlight: 'rgb(255 255 255 / 0.6)' } }

const STAGGER_MS = 40
/**
 * Lists arrive one item after another, left to right and top to bottom; a skeleton leaves the same way.
 * Each item fades in exactly where its skeleton was: a rise would read as the skeleton dropping first.
 * Skullet calls an item a unit: a card or a row with siblings like it. Smaller text comes a beat behind its
 * title. Always staggered, even for a fast load, so the entrance never changes.
 */
const reveal: RevealSpec = {
	duration: 600,
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
		id: `sample-${index}`, username: `A0123456${index}`, name, role: 'student', mustChangePassword: false, points: 1250, groupId: null, disabled: false, card: { skin: 'xp', material: 'none' },
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

// Who saw the portal last, so the very first shape, drawn before the session answers, is already theirs.
const SESSION_KEY = 'xp-skeleton-session'
let seen: { role?: string; mode?: string } = (() => {
	try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') } catch { return {} }
})()

export function rememberSession(session: PortalSession) {
	seen = { role: session.user?.role, mode: session.mode }
	try { localStorage.setItem(SESSION_KEY, JSON.stringify(seen)) } catch { /* the shape falls back to a student's */ }
}

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

/** The cards as a library draws them; `skullet-ignore` on the real card's menu keeps the two shapes equal. */
function SampleCards({ boards }: { boards: Board[] }) {
	return boards.map((board) => <div key={board.id} className="board-card">
		<div className="board-card-preview" />
		<div className="board-card-caption"><strong>{board.name}</strong><time>{dateFormat.format(board.updatedAt)}</time></div>
	</div>)
}

/** The library while it loads: sidebar, title and, for the canvas list, its cards. The logo never changes, so it shows as itself. */
export function LibrarySkeleton({ page = 'panel' }: { page?: 'cards' | 'shop' | 'panel' }) {
	const student = seen.role === 'student', cards = page === 'cards'
	return <PageSkeleton className="skeleton-page">
		<main className={page === 'shop' ? 'board-manager skeleton-shop' : 'board-manager'}>
			<aside className="board-sidebar">
				<div className="board-sidebar-heading" skullet-own=""><XpLogo size={36} /></div>
				<div className="board-navigation">
					{(student ? ['Clases', 'Mis canvas'] : ['Todos', 'Recientes', 'Favoritos']).map((name) => <div key={name} className="board-nav-item"><span>{name}</span></div>)}
					{!student && <div className="board-folder-heading">Carpetas</div>}
				</div>
				{student && <div className="board-nav-item board-nav-shop"><span className="board-nav-shop__label">Tienda</span></div>}
				<div className="board-account-trigger"><span className="board-account-name">Mi cuenta</span></div>
			</aside>
			<section className="board-main">
				<header className="board-header">
					<span className="skeleton-trigger" skullet-block="" />
					{page === 'shop' && <button className="xp-icon-button" />}
					<h1>{page === 'shop' ? 'Tienda' : !cards ? 'Mis canvases' : student ? 'Clases' : 'Todos los canvases'}</h1>
					{cards && !student && <div className="board-header-actions"><label className="board-search" skullet-block=""><input /></label><button className="xp-icon-button board-new" /></div>}
				</header>
				{/* The same key as the list it stands in for, so both draw the shape that list last had. */}
				{cards ? <Skeleton id={student ? 'classes:all' : 'library'} data={null} sample={SAMPLE_BOARDS}>{(boards) => <div className={student ? 'board-grid board-grid--student' : 'board-grid'}><SampleCards boards={boards} /></div>}</Skeleton>
					: page === 'shop' ? <div className="shop"><ShopShape /></div> : <div className="skeleton-panel" skullet-block="" />}
			</section>
		</main>
	</PageSkeleton>
}

/** The shop's sections in its own classes, so each card and line sits where the shop will draw it. */
export function ShopShape() {
	return <>
		<section className="shop-hero">
			<div className="shop-machine-frame" data-status={seen.role === 'teacher' || undefined}><span className="shop-skeleton__machine" skullet-block="" /></div>
			<section className="shop-panel">
				<div className="shop-scroller"><ul className="shop-strip" style={{ '--card-w': `${CARD.spread}px` } as CSSProperties}>
					{range(6).map((index) => <li key={index}><span className="shop-skeleton__card" skullet-block="" /></li>)}
				</ul></div>
				<div className="shop-panel__content">
					<h2 className="shop-panel__title">¡Repasa los conceptos de clase y gana una tirada! :)</h2>
					<div className="shop-panel__step" data-view="free">{seen.role === 'teacher'
						? <p className="shop-panel__note">Los alumnos ganan una tirada gratis al repasar 3 preguntas.</p>
						: <button className="shop-button">Repasar 3 preguntas</button>}</div>
				</div>
			</section>
		</section>
		<section className="shop-cards">
			<div className="shop-cards__heading"><h2>Cartas en venta</h2></div>
			<div className="shop-scroller"><ul className="shop-row" style={{ '--card-w': `${CARD.row}px` } as CSSProperties}>
				{range(6).map((index) => <li key={index}><span className="shop-skeleton__sale" skullet-block="" /></li>)}
			</ul></div>
		</section>
	</>
}

const glyphs = (count: number) => range(count).map((index) => <span key={index} className="skeleton-glyph" skullet-block="" />)

/**
 * The canvas as its role draws it, with the header, toolbar and students panel in their real classes so each
 * width lays them out like the room. The toolbars belong to tldraw, so their shapes copy its positions. `hold`
 * keeps the shape in front until the editor has mounted its own toolbar.
 */
export function CanvasSkeleton({ hold }: { hold?: Promise<unknown> }) {
	const hint = canvasHint(), portal = seen.mode !== 'local', teacher = portal && seen.role === 'teacher'
	const personal = Boolean(hint.personal), canEdit = teacher || personal
	return <PageSkeleton className="skeleton-page" hold={hold}>
		<div className="canvas-room">
			<header className="canvas-header">
				<div className="canvas-identity">
					<button className="xp-icon-button" />
					<span className="canvas-board-title">{hint.name || 'Principal'}</span>
					{portal && <div className="canvas-header-settings"><div className="skeleton-page-menu">{glyphs(1)}<span>Page 1</span>{canEdit && glyphs(1)}</div></div>}
				</div>
				{portal && <nav className="canvas-actions">
					{teacher && !personal && ['Gachapon', 'Pregunta', 'Buzón', 'Parejas'].map((name) => <button key={name} className="header-question">{name}</button>)}
					{teacher && <>
						<button className="header-resources">Recursos</button>
						<button className="header-emojis" skullet-block=""><Icon name="smile" size={20} /></button>
						<label className="quick-shape-toggle header-quick-shape" skullet-block=""><input type="checkbox" /><span>QuickShape</span></label>
						<button className="snap-hold" skullet-block=""><span className="snap-hold__glyph">⌜</span><span className="snap-hold__label">Snap</span></button>
					</>}
					{!teacher && <>
						<button className="canvas-action--secondary">Seguir a Leo</button>
						<button className="canvas-raise-hand" skullet-block=""><span className="hand-raise-emoji">🖐️</span><span>Levantar la mano</span></button>
					</>}
					<button className="connected-students__toggle" skullet-block=""><span className="connected-students__count">0</span><Icon name="users" size={22} /></button>
				</nav>}
			</header>
			<div className="canvas-workspace">
				{portal && <main className="canvas-stage">
					{canEdit ? <>
						<aside className="ipad-toolbar skeleton-rail">
							<div className="ipad-toolbar__body">
								<div className="ipad-toolbar__tools-scroll"><div className="ipad-toolbar__tools">{glyphs(teacher ? 14 : 11)}</div></div>
								<div className="ipad-toolbar__properties">{glyphs(2)}</div>
								<div className="ipad-toolbar__footer">{glyphs(3)}</div>
							</div>
						</aside>
						<div className="skeleton-panel-tools skeleton-quick-actions">{glyphs(5)}</div>
						<div className="skeleton-panel-tools skeleton-phone-tools">{glyphs(8)}</div>
						<div className="skeleton-panel-tools skeleton-phone-styles">{glyphs(1)}</div>
						<span className="skeleton-grid-toggle" skullet-block="" />
					</> : <div className="skeleton-panel-tools skeleton-viewer-tools">{glyphs(2)}</div>}
					<div className="skeleton-panel-tools skeleton-zoom"><span>100%</span>{glyphs(1)}</div>
				</main>}
				{portal && <aside className="connected-students" data-expanded="true">
					<div className="connected-students__panel">
						<div className="connected-students__heading"><h2 className="connected-students__title">Alumnos conectados</h2>{teacher && <span className="connected-students__dice" skullet-block="" />}</div>
						{/* A student always finds themselves in the list; the teacher, outside class, finds it empty. */}
						<div className="connected-students__body">{teacher ? <p>Todavía no hay alumnos conectados.</p> : <ul><li><span className="connected-students__avatar">M</span><span className="connected-students__name">María Fernanda</span></li></ul>}</div>
					</div>
				</aside>}
			</div>
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
	if (['/', '/perfil', '/mi-pase', '/tienda', '/alumnos'].includes(path)) return <LibrarySkeleton page={path === '/' ? 'cards' : path === '/tienda' ? 'shop' : 'panel'} />
	return null
}
