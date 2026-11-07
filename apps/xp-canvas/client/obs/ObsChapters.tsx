import { useMemo, useState } from 'react'
import { computed, useEditor, useValue, type TLShape } from 'tldraw'
import { sectionNumber } from '../../shared/obs'
import { findSections, TITLED } from './sections'
import { useObsContext } from './useObs'
import './obs.css'

// Below this on-screen width a block is too small for a button to read as part of it.
const MIN_BLOCK_WIDTH = 160

/** Leo's chapter buttons, one in the top-right corner of every «N · …» block. Lives in tldraw's InFrontOfTheCanvas layer. */
export function ObsChapters() {
	const editor = useEditor()
	const obs = useObsContext()
	const [pending, setPending] = useState<number | null>(null)
	const sections = useMemo(() => {
		// Reading rich text is the expensive part; cached per shape, a pencil stroke only re-reads the stroke.
		const titles = editor.store.createComputedCache<number | null, TLShape>('obs section title', (shape) =>
			TITLED.has(shape.type) ? sectionNumber(editor.getShapeUtil(shape).getText(shape)) : null)
		return computed('obs sections', () => findSections(editor.getCurrentPageShapes()
			.filter((shape) => shape.type === 'geo' || shape.type === 'frame' || titles.get(shape.id))
			.map((shape) => ({ id: shape.id, type: shape.type, number: titles.get(shape.id) ?? null, bounds: editor.getShapePageBounds(shape) ?? { x: 0, y: 0, w: 0, h: 0 } }))))
	}, [editor])
	const placed = useValue('obs section buttons', () => {
		const viewport = editor.getViewportPageBounds(), zoom = editor.getZoomLevel()
		return sections.get().flatMap((section) => {
			const { x, y, w, h } = section.bounds
			if (w * zoom < MIN_BLOCK_WIDTH || x > viewport.maxX || y > viewport.maxY || x + w < viewport.x || y + h < viewport.y) return []
			// A block that runs off the right edge keeps its button on screen, as long as the button still fits over the block.
			const corner = editor.pageToViewport({ x: Math.max(x + MIN_BLOCK_WIDTH / zoom, Math.min(x + w, viewport.maxX)), y })
			return [{ id: section.id, number: section.number, left: corner.x, top: corner.y }]
		})
	}, [editor, sections])
	if (!obs) return null
	const { vista } = obs

	return <>{placed.map(({ id, number, left, top }) => {
		const title = vista.obs ? vista.titulos[number - 1] : undefined
		const live = vista.obs && vista.capitulo === number
		const missing = vista.obs && title === undefined
		const label = !vista.obs ? 'OBS sin conectar' : live ? `En OBS · ${title || number}` : missing ? `OBS no tiene el ${number}` : `${number} · ${title || 'sin título'}`
		return <button
			key={id}
			type="button"
			className="obs-chapter"
			style={{ left, top }}
			data-live={live || undefined}
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
			<span className="obs-chapter__dot" aria-hidden="true" />
			<span className="obs-chapter__label">{label}</span>
		</button>
	})}</>
}

/** What's playing on stream, for students who follow the class on the canvas. */
export function SongCard() {
	const obs = useObsContext()
	const song = obs?.vista.obs ? obs.vista.sonando : null
	if (!song) return null
	return <div className="obs-song" role="status" aria-label={`Suena ${song.titulo}${song.artista ? ` de ${song.artista}` : ''}`} key={`${song.titulo}\n${song.artista}`}>
		{song.portada
			? <img className="obs-song__cover" src={song.portada} alt="" referrerPolicy="no-referrer" />
			: <span className="obs-song__cover obs-song__cover--empty" aria-hidden="true">♪</span>}
		<span className="obs-song__text">
			<span className="obs-song__title">{song.titulo}</span>
			{song.artista && <span className="obs-song__artist">{song.artista}</span>}
		</span>
		<span className="obs-song__bars" aria-hidden="true"><i /><i /><i /></span>
	</div>
}
