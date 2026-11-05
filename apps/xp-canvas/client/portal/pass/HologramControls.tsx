import { useEffect, useRef, type PointerEvent } from 'react'
import {
	animate,
	motion,
	useMotionValue,
	useTransform,
	type MotionValue,
} from 'motion/react'
import { materialItem, ownsCosmetic, type CosmeticId } from '../../../shared/cosmetics'
import {
	CARD_MATERIALS,
	passHologram,
	type CardMaterial,
	type HoloArea,
	type HoloPattern,
	type PassDraft,
} from '../../../shared/pass'
import { clamp } from './stickerGeometry'
import { hasHologramAreas, subjectLabel } from './hologramMasks'
import { foilPattern } from './foilLighting'
import { usePassReducedMotion } from './usePassReducedMotion'
import { MaterialMini } from './materials/MaterialMini'
import { materialName } from './materials/materials'

const selectionTransition = {
	type: 'tween',
	duration: 0.14,
	ease: [0.16, 1, 0.3, 1],
} as const

const patterns: { id: HoloPattern; name: string; path: string }[] = [
	{ id: 'grid', name: 'Cuadrícula', path: 'M5 5h14v14H5z' },
	{ id: 'triangles', name: 'Triángulos', path: 'M12 4 21 20H3z' },
	{
		id: 'rings',
		name: 'Círculos',
		path: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0',
	},
	{ id: 'flow', name: 'Líneas', path: 'M5 19 19 5' },
	{
		id: 'stars',
		name: 'Estrellas',
		path: 'm12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6l-5.7 3 1.1-6.4L2.8 9.7l6.4-.9Z',
	},
]
type Mode = 'normal' | 'holograma' | 'especial'
const MODES: { id: Mode; name: string }[] = [{ id: 'normal', name: 'Normal' }, { id: 'holograma', name: 'Holograma' }, { id: 'especial', name: 'Especial' }]
export const orbitPoint = (v: number) => ({
	x: 180 + 145 * Math.sin(v * Math.PI * 2),
	y: 64 + 40 * Math.sin(v * Math.PI * 4),
})
export function HologramControls({
	draft,
	phase,
	owned = [],
	onChange,
}: {
	draft: PassDraft
	phase: MotionValue<number>
	/** Cosmetics the student has: Especial offers only these materials, and hides with none. */
	owned?: readonly CosmeticId[]
	onChange: (d: Partial<PassDraft>) => void
}) {
	const holo = passHologram(draft)
	const bought = new Set<string>(owned)
	const specials = CARD_MATERIALS.filter((m) => m !== 'none' && ownsCosmetic(materialItem(m)!, bought))
	// Tres acabados excluyentes: normal, holograma con sus ajustes, o un material especial.
	const mode: Mode = holo.material !== 'none' ? 'especial' : draft.finish === 'matte' ? 'normal' : 'holograma'
	const modes = specials.length || mode === 'especial' ? MODES : MODES.slice(0, 2)
	const lastMaterial = useRef<CardMaterial>(specials[0] ?? 'none')
	useEffect(() => { if (holo.material !== 'none') lastMaterial.current = holo.material }, [holo.material])
	const set = (d: Partial<PassDraft>) => onChange(d.finish && d.finish !== 'matte' ? { ...d, hologram: { ...(d.hologram ?? holo), material: 'none' } } : d)
	const pickMode = (next: Mode) => {
		if (next === 'especial' && lastMaterial.current === 'none') return
		if (next === 'normal') onChange({ finish: 'matte', hologram: { ...holo, material: 'none' } })
		else if (next === 'holograma') onChange({ finish: 'prism', hologram: { ...holo, material: 'none' } })
		else onChange({ finish: 'matte', hologram: { ...holo, material: lastMaterial.current } })
	}
	const reduced = usePassReducedMotion()
	const print = foilPattern(holo.phase)
	const areas: { id: HoloArea; name: string }[] = [
		{ id: 'all', name: 'Toda' },
		...(hasHologramAreas(draft.skin) ? [{ id: 'subject' as const, name: subjectLabel(draft.skin) }, { id: 'background' as const, name: 'Fondo' }] : []),
	]
	const areaIndex = Math.max(0, areas.findIndex((s) => s.id === holo.area))
	const tracking = useRef<{ id: number; rect: DOMRect; before: number } | null>(
		null,
	)
	const hueTracking = useRef<{
		id: number
		left: number
		right: number
	} | null>(null)
	const hueWidth = useRef(1)
	const huePull = useMotionValue(0)
	const hueOffset = useTransform(huePull, (v) => v / 2)
	const hueScale = useTransform(
		huePull,
		(v) => 1 + Math.abs(v) / hueWidth.current,
	)
	useEffect(() => {
		function move(e: { pointerId: number; clientX: number }) {
			const t = hueTracking.current
			if (!t || t.id !== e.pointerId || reduced) return
			const excess =
				e.clientX < t.left
					? e.clientX - t.left
					: e.clientX > t.right
						? e.clientX - t.right
						: 0
			// Diminishing resistance, capped at 14 px. No spring while held.
			huePull.set(
				Math.sign(excess) * 14 * (1 - Math.exp(-Math.abs(excess) / 70)),
			)
		}
		function settle() {
			if (!hueTracking.current) return
			hueTracking.current = null
			if (reduced) huePull.set(0)
			else
				animate(huePull, 0, {
					type: 'spring',
					stiffness: 500,
					damping: 28,
					mass: 0.45,
				})
		}
		function release(e: { pointerId: number }) {
			if (hueTracking.current?.id === e.pointerId) settle()
		}
		if (reduced) {
			huePull.stop()
			huePull.set(0)
		}
		// Native range dragging can retarget pointer events outside the input.
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', release)
		window.addEventListener('pointercancel', release)
		window.addEventListener('blur', settle)
		return () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', release)
			window.removeEventListener('pointercancel', release)
			window.removeEventListener('blur', settle)
			hueTracking.current = null
			huePull.stop()
		}
	}, [reduced, huePull])
	const cx = useTransform(phase, (v) => orbitPoint(v).x),
		cy = useTransform(phase, (v) => orbitPoint(v).y)
	useEffect(() => {
		if (!tracking.current) phase.set(holo.phase)
	}, [holo.phase, phase])
	function point(e: PointerEvent<SVGSVGElement>) {
		const r = tracking.current!.rect,
			x = ((e.clientX - r.left) / r.width) * 360,
			y = ((e.clientY - r.top) / r.height) * 128
		let best = phase.get(),
			distance = Infinity
		for (let i = 0; i < 240; i++) {
			const v = i / 240,
				p = orbitPoint(v),
				diff = Math.abs(v - phase.get())
			const score = Math.hypot(p.x - x, p.y - y) + Math.min(diff, 1 - diff) * 8
			if (score < distance) {
				best = v
				distance = score
			}
		}
		phase.set(best)
	}
	function end(e: PointerEvent<SVGSVGElement>, cancel = false) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		tracking.current = null
		if (cancel) phase.set(t.before)
		else
			set({
				hologram: { ...holo, phase: Math.round(phase.get() * 1000) / 1000 },
			})
	}
	const path = Array.from({ length: 121 }, (_, i) => {
		const p = orbitPoint(i / 120)
		return `${i ? 'L' : 'M'}${p.x},${p.y}`
	}).join(' ')
	const segments = (label: string, items: { id: string; name: string }[], index: number, pick: (id: string) => void, sub = false) => (
		<div className="pass-holo-styles" data-sub={sub || undefined} role="group" aria-label={label} style={{ '--n': items.length } as React.CSSProperties}>
			<motion.span
				className="pass-area-selection"
				aria-hidden="true"
				initial={false}
				animate={{ x: `calc(${index * 100}% + ${index * 3}px)` }}
				transition={reduced ? { duration: 0 } : selectionTransition}
			/>
			{items.map((item, i) => (
				<button key={item.id} aria-pressed={i === index} onClick={() => pick(item.id)}>{item.name}</button>
			))}
		</div>
	)
	return (
		<div className="pass-holo-controls" data-mode={mode}>
			{segments('Acabado de la carta', modes, modes.findIndex((m) => m.id === mode), (id) => pickMode(id as Mode))}
			{mode === 'holograma' && <>
			{areas.length > 1 && segments('Dónde aplicar el holográfico', areas, areaIndex, (id) => set({ finish: 'prism', hologram: { ...holo, area: id as HoloArea } }), true)}
			<svg
				className="pass-orbit"
				viewBox="0 0 360 128"
				preserveAspectRatio="none"
				role="slider"
				tabIndex={0}
				aria-label="Giro y tamaño del patrón"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(holo.phase * 100)}
				aria-valuetext={`Giro ${Math.round(print.rotation)} grados, tamaño ${Math.round(print.scale * 100)} por ciento`}
				onPointerDown={(e) => {
					if (e.button !== 0 || tracking.current) return
					e.preventDefault()
					tracking.current = {
						id: e.pointerId,
						rect: e.currentTarget.getBoundingClientRect(),
						before: phase.get(),
					}
					e.currentTarget.setPointerCapture(e.pointerId)
					if (draft.finish !== 'prism')
						set({ finish: 'prism', hologram: holo })
					point(e)
				}}
				onPointerMove={(e) => {
					if (tracking.current?.id === e.pointerId) point(e)
				}}
				onPointerUp={end}
				onPointerCancel={(e) => end(e, true)}
				onLostPointerCapture={(e) => end(e, true)}
				onKeyDown={(e) => {
					const delta = (
						{
							ArrowLeft: -0.025,
							ArrowDown: -0.025,
							ArrowRight: 0.025,
							ArrowUp: 0.025,
						} as Record<string, number>
					)[e.key]
					if (!delta) return
					e.preventDefault()
					const value = clamp(holo.phase + delta, 0, 1)
					phase.set(value)
					set({ finish: 'prism', hologram: { ...holo, phase: value } })
				}}
			>
				<path
					d={path}
					fill="none"
					stroke="currentColor"
					strokeWidth="27"
					strokeLinecap="round"
				/>
				<motion.circle cx={cx} cy={cy} r="13" fill="#fff" />
			</svg>
			<div className="pass-holo-row">
				<div
					className="pass-pattern-picker"
					role="group"
					aria-label="Patrón holográfico"
				>
					<motion.span
						className="pass-pattern-selection"
						aria-hidden="true"
						initial={false}
						animate={{
							x: `${patterns.findIndex((p) => p.id === holo.pattern) * 100}%`,
						}}
						transition={reduced ? { duration: 0 } : selectionTransition}
					/>
					{patterns.map((p) => (
						<button
							key={p.id}
							aria-label={p.name}
							title={p.name}
							aria-pressed={holo.pattern === p.id}
							onClick={() =>
								set({
									finish: 'prism',
									hologram: { ...holo, pattern: p.id },
								})
							}
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.6"
							>
								<path d={p.path} />
							</svg>
						</button>
					))}
				</div>
				<motion.label
					className="pass-light-color"
					data-rainbow={holo.hue === 360}
					style={{ x: hueOffset, scaleX: hueScale }}
				>
					<span className="pass-sr-only">Color del holográfico</span>
					<input
						type="range"
						min="0"
						max="360"
						value={holo.hue}
						aria-label="Color del holográfico"
						title="Color del holográfico"
						style={{
							color: `hsl(${holo.hue} 100% 56%)`,
						}}
						aria-valuetext={
							holo.hue === 360 ? 'Arcoíris' : `${Math.round(holo.hue)} grados`
						}
						onPointerDown={(e) => {
							if (e.button !== 0 || hueTracking.current) return
							huePull.stop()
							const r = e.currentTarget.getBoundingClientRect()
							// offsetWidth excludes any unfinished elastic return.
							hueWidth.current = e.currentTarget.offsetWidth
							const left = r.left - Math.min(0, huePull.get())
							hueTracking.current = {
								id: e.pointerId,
								left: left + 23,
								right: left + hueWidth.current - 23,
							}
						}}
						onChange={(e) =>
							set({
								finish: 'prism',
								hologram: { ...holo, hue: Number(e.target.value) },
							})
						}
					/>
				</motion.label>
			</div>
			</>}
			{mode === 'especial' && <div className="pass-material-picker" role="group" aria-label="Material especial">
				{specials.map((material) => (
					<button
						key={material}
						aria-label={materialName(material)}
						title={materialName(material)}
						aria-pressed={holo.material === material}
						onClick={() => onChange({ finish: 'matte', hologram: { ...holo, material } })}
					>
						<MaterialMini skin={draft.skin} material={material} />
					</button>
				))}
			</div>}
		</div>
	)
}
