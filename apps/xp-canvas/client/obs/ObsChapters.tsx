import { useEffect, useRef, useState } from 'react'
import { computed, useEditor, useValue, type Computed, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import { sectionNumber } from '../../shared/obs'
import { findSections, TITLED } from './sections'
import { useObsContext } from './useObs'
import './obs.css'

// Below this on-screen width a block is too small for a button to read as part of it.
const MIN_BLOCK_WIDTH = 160

const sectionCache = new WeakMap<Editor, Computed<ReturnType<typeof findSections>>>()
/** The «N · …» blocks of the current page, shared by the buttons and the live border. */
function sectionsOf(editor: Editor) {
	let sections = sectionCache.get(editor)
	if (!sections) {
		// Reading rich text is the expensive part; cached per shape, a pencil stroke only re-reads the stroke.
		const titles = editor.store.createComputedCache<number | null, TLShape>('obs section title', (shape) =>
			TITLED.has(shape.type) ? sectionNumber(editor.getShapeUtil(shape).getText(shape)) : null)
		sections = computed('obs sections', () => findSections(editor.getCurrentPageShapes()
			.filter((shape) => shape.type === 'geo' || shape.type === 'frame' || titles.get(shape.id))
			.map((shape) => ({ id: shape.id, type: shape.type, number: titles.get(shape.id) ?? null, bounds: editor.getShapePageBounds(shape) ?? { x: 0, y: 0, w: 0, h: 0 } }))))
		sectionCache.set(editor, sections)
	}
	return sections
}

/** Leo's chapter buttons, one in the top-right corner of every «N · …» block. Lives in tldraw's InFrontOfTheCanvas layer. */
export function ObsChapters() {
	const editor = useEditor()
	const obs = useObsContext()
	const [pending, setPending] = useState<number | null>(null)
	const sections = sectionsOf(editor)
	const placed = useValue('obs section buttons', () => {
		const viewport = editor.getViewportPageBounds(), zoom = editor.getZoomLevel()
		return sections.get().flatMap((section) => {
			const { x, y, w, h } = section.bounds
			if (w * zoom < MIN_BLOCK_WIDTH || x > viewport.maxX || y > viewport.maxY || x + w < viewport.x || y + h < viewport.y) return []
			const corner = editor.pageToViewport({ x: x + w, y })
			return [{ id: section.id, number: section.number, left: corner.x, top: corner.y }]
		})
	}, [editor, sections])
	if (!obs) return null
	const { vista } = obs

	return <>{placed.map(({ id, number, left, top }) => {
		const title = vista.obs ? vista.titulos[number - 1] : undefined
		const live = vista.obs && vista.capitulo === number
		const missing = vista.obs && title === undefined
		const label = !vista.obs ? 'OBS sin conectar' : live ? title || `${number}` : missing ? `OBS no tiene el ${number}` : `${number} · ${title || 'sin título'}`
		return <button
			key={id}
			type="button"
			className="obs-chapter"
			style={{ left, top }}
			data-live={live || undefined}
			aria-label={live ? `En OBS: ${label}` : undefined}
			data-offline={!vista.obs || undefined}
			disabled={!vista.obs || missing || live || pending !== null}
			aria-busy={pending === number}
			title={vista.obs ? `Pasar OBS al capítulo ${number}` : 'Abre el dock de capítulos en OBS'}
			onPointerDown={(event) => { editor.markEventAsHandled(event); event.stopPropagation() }}
			onClick={() => {
				setPending(number)
				void obs.irA(number).finally(() => setPending(null))
			}}
		>
			{!live && <span className="obs-chapter__dot" aria-hidden="true" />}
			<span className="obs-chapter__label">{label}</span>
		</button>
	})}</>
}

// Exit is ~20% faster than the draw-in's settle; must match .obs-border[data-leaving] in obs.css.
const BORDER_EXIT_MS = 180

/**
 * The live block's own border turns orange, for Leo only. A copy of tldraw's rendered stroke sits on top of it in the
 * OnTheCanvas layer, in page space, so it can't drift from the shape; the shape itself is never changed.
 */
export function ObsLiveBorder() {
	const editor = useEditor()
	const obs = useObsContext()
	const capitulo = obs?.vista.obs ? obs.vista.capitulo : 0
	const live = useValue('obs live blocks', () => capitulo
		? sectionsOf(editor).get().filter((section) => section.number === capitulo).map((section) => section.id).join(' ') : '', [editor, capitulo])
	const [leaving, setLeaving] = useState<string[]>([])
	const previous = useRef('')
	useEffect(() => {
		const now = live.split(' ').filter(Boolean)
		const gone = previous.current.split(' ').filter((id) => id && !now.includes(id))
		previous.current = live
		if (!gone.length) return
		setLeaving((current) => [...current, ...gone])
		window.setTimeout(() => setLeaving((current) => current.filter((id) => !gone.includes(id))), BORDER_EXIT_MS)
	}, [live])
	const ids = live.split(' ').filter(Boolean)
	return <>
		{ids.map((id) => <LiveBorder key={id} id={id as TLShapeId} />)}
		{leaving.filter((id) => !ids.includes(id)).map((id) => <LiveBorder key={id} id={id as TLShapeId} leaving />)}
	</>
}

function LiveBorder({ id, leaving }: { id: TLShapeId; leaving?: boolean }) {
	const editor = useEditor()
	const shape = useValue('obs live shape', () => editor.getShape(id), [editor, id])
	const transform = useValue('obs live transform', () => editor.getShapePageTransform(id)?.toCssString(), [editor, id])
	const [stroke, setStroke] = useState<{ d: string[]; width: string } | null>(null)
	useEffect(() => {
		// tldraw draws the hand-made outline after the shape record changes; read it on the next frame.
		const frame = requestAnimationFrame(() => {
			const path = document.querySelector<SVGPathElement>(`.tl-shape[data-shape-id="${CSS.escape(id)}"] .tl-svg-container path[stroke]:not([stroke="none"])`)
			const d = path?.getAttribute('d')
			// The draw style is two passes around the shape; splitting them lets both trace the border together, as one stroke.
			setStroke(d ? { d: d.split(/(?=M )/).map((part) => part.trim()), width: path!.getAttribute('stroke-width') ?? '2' } : null)
		})
		return () => cancelAnimationFrame(frame)
	}, [id, shape])
	if (!shape || !stroke || !transform) return null
	const { w = 0, h = 0 } = shape.props as { w?: number; h?: number }
	return <div className="obs-border" data-leaving={leaving || undefined} style={{ transform, width: w, height: h }} aria-hidden="true">
		<svg className="tl-svg-container"><g>{stroke.d.map((d, i) => <path key={i} d={d} pathLength={1} strokeWidth={stroke.width} fill="none" />)}</g></svg>
	</div>
}

/** What's playing on stream, in the free space of the canvas header, for students who follow the class on the canvas. */
export function SongCard() {
	const obs = useObsContext()
	const song = obs?.vista.obs ? obs.vista.sonando : null
	if (!song) return null
	return <div className="obs-song-slot"><div className="obs-song" role="status" aria-label={`Suena ${song.titulo}${song.artista ? ` de ${song.artista}` : ''}`} key={`${song.titulo}\n${song.artista}`}>
		{song.portada
			? <img className="obs-song__cover" src={song.portada} alt="" referrerPolicy="no-referrer" />
			: <span className="obs-song__cover obs-song__cover--empty" aria-hidden="true">♪</span>}
		<span className="obs-song__text">
			<span className="obs-song__title">{song.titulo}</span>
			{song.artista && <span className="obs-song__artist">{song.artista}</span>}
		</span>
		<span className="obs-song__bars" aria-hidden="true"><i /><i /><i /></span>
	</div></div>
}
