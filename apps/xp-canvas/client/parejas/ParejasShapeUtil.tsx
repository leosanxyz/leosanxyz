import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor } from 'tldraw'
import { drawPair, PAREJAS_DURATION, pairLabel, parejasShapeProps, remainingParticipants, type Participant, type ParejasShape } from '../../shared/parejasShape'
import { Icon } from '../components/Icon'
import { uuid } from '../uuid'
import { useParejas } from './ParejasContext'
import { ballStart, FALL, listAt, openAt, SPIN } from './parejasPose'
import type { Ball } from './parejasScene'
import { prepareParejasAudio, scheduleParejasSounds } from './parejasSounds'
import { useParejas3D } from './useParejas3D'
import './parejas.css'

// Medidas de diseño. La figura escala todo el contenido, así se ve igual a cualquier tamaño.
export const PAREJAS_WIDTH = 640
export const PAREJAS_HEIGHT = 420
const STAGE = { width: 330, height: 420 }
const CAPSULE_COLORS = ['#ffb347', '#6fb7ff', '#e58ae8', '#8fd66b', '#f3e2cc', '#ff8fb8']
/** Bolas que caben en el tambor; si hay más participantes, el resto no se dibuja. */
const DRUM_BALLS = 24
/** Dónde sube el nombre de cada bola, respecto a la bandeja. En un trío el del centro va más arriba. */
const LABELS = [[[0, -80]], [[-72, -80], [72, -80]], [[-76, -74], [76, -74], [0, -122]]]

export class ParejasShapeUtil extends BaseBoxShapeUtil<ParejasShape> {
	static override type = 'parejas' as const
	static override props = parejasShapeProps
	override getDefaultProps(): ParejasShape['props'] {
		return { w: PAREJAS_WIDTH, h: PAREJAS_HEIGHT, title: '', participants: [], pairs: [], drawnAt: 0, revision: uuid() }
	}
	override canEdit() { return false }
	override isAspectRatioLocked() { return true }
	override getText(shape: ParejasShape) { return [shape.props.title, ...pairNames(shape).map(pairLabel)].filter(Boolean).join('\n') }
	override getIndicatorPath(shape: ParejasShape) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w, shape.props.h, 16 * shape.props.w / PAREJAS_WIDTH); return p }
	override component(shape: ParejasShape) { return <Parejas shape={shape} /> }
	override toSvg(shape: ParejasShape) {
		const { participants, pairs, title } = shape.props
		const { drum, pair } = toBalls(participants, pairs, [])
		const lines = pairNames(shape).map((names, i) => `${i + 1} · ${pairLabel(names)}`)
		const top = title ? 92 : 64
		return <g transform={`scale(${shape.props.w / PAREJAS_WIDTH})`}>
			<FlatTombola drum={drum} pair={pair} />
			<rect x={350} width={290} height={PAREJAS_HEIGHT} rx={16} fill="#fffdfa" stroke="#c9c5bc" />
			<text x={372} y={40} fontSize={13} fill="#6b6861">Parejas</text>
			{title && <text x={372} y={72} fontSize={22} fontWeight={600} fill="#24231f">{title}</text>}
			{lines.slice(0, 14).map((line, i) => <text key={i} x={372} y={top + i * 22} fontSize={15} fill="#24231f">{line.length > 34 ? `${line.slice(0, 33)}…` : line}</text>)}
			<text x={372} y={396} fontSize={14} fill="#6b6861">{`quedan ${remainingParticipants(participants, pairs).length}`}</text>
		</g>
	}
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const initialOf = (name: string) => ([...name.trim()][0] ?? '?').toLocaleUpperCase('es')

function pairNames(shape: ParejasShape) {
	const byId = new Map(shape.props.participants.map((p) => [p.id, p.name]))
	return shape.props.pairs.map((pair) => pair.map((id) => byId.get(id) ?? '¿?'))
}

function toBalls(participants: Participant[], pairs: string[][], previous: string[]) {
	const order = new Map(participants.map((p, i) => [p.id, i]))
	const ball = (id: string): Ball[] => {
		const i = order.get(id), p = participants[i ?? -1]
		return p ? [{ id, initial: initialOf(p.name), color: CAPSULE_COLORS[i! % CAPSULE_COLORS.length], order: i! }] : []
	}
	return {
		drum: remainingParticipants(participants, pairs).slice(0, DRUM_BALLS).flatMap((p) => ball(p.id)),
		pair: (pairs.at(-1) ?? []).flatMap(ball),
		previous: previous.flatMap(ball),
	}
}

/** Un sorteo visto desde este dispositivo: `start` es el instante local en que empezó, en `performance.now()`. */
type Draw = { at: number; start: number; previous: string[] }

function Parejas({ shape }: { shape: ParejasShape }) {
	const editor = useEditor()
	const { isTeacher, edit } = useParejas()
	const { title, participants, pairs, drawnAt } = shape.props
	const scale = shape.props.w / PAREJAS_WIDTH
	// Quien abre el canvas tarde ve la etapa que toca; un cambio en vivo empieza al recibirse si el reloj del maestro no coincide.
	const [draw, setDraw] = useState<Draw | null>(() => drawnAt ? { at: drawnAt, start: performance.now() - Math.max(0, Date.now() - drawnAt), previous: pairs.at(-2) ?? [] } : null)
	const shownPair = useRef(pairs.at(-1) ?? [])
	useLayoutEffect(() => {
		if (drawnAt === (draw?.at ?? 0)) return
		if (!drawnAt) { setDraw(null); return }
		const age = Date.now() - drawnAt
		setDraw({ at: drawnAt, start: performance.now() - (age >= 0 && age < 2000 ? age : 0), previous: shownPair.current })
	}, [drawnAt])
	useEffect(() => { shownPair.current = pairs.at(-1) ?? [] })

	const current = pairs.at(-1) ?? []
	const elapsed = draw ? performance.now() - draw.start : Infinity
	const reduced = reducedMotion()
	const listed = reduced || elapsed >= listAt(current.length) * 1000
	const animating = !reduced && elapsed < PAREJAS_DURATION
	// La lista y los botones cambian en dos momentos del sorteo.
	const [, rerender] = useReducer((n: number) => n + 1, 0)
	useEffect(() => {
		if (!draw) return
		const timers = [listAt(current.length) * 1000, PAREJAS_DURATION].map((moment) => moment - (performance.now() - draw.start)).filter((wait) => wait > 0).map((wait) => window.setTimeout(rerender, wait + 20))
		return () => timers.forEach(clearTimeout)
	}, [draw])

	const balls = toBalls(participants, pairs, draw?.previous ?? [])
	const canvas = useRef<HTMLCanvasElement>(null), tray = useRef<HTMLDivElement>(null), flat = useRef<SVGSVGElement>(null), list = useRef<HTMLOListElement>(null)
	const status3d = useParejas3D(canvas, { ...STAGE, scale, start: draw?.start ?? null, balls })
	const failed = status3d !== 'ready'

	useEffect(() => { prepareParejasAudio() }, [])
	useEffect(() => { if (draw) scheduleParejasSounds(`${shape.id}:${draw.at}`, (performance.now() - draw.start) / 1000, current.length, reducedMotion()) }, [draw?.at])

	// Los nombres suben al abrirse las bolas y la bandeja destella; se sincronizan buscando el instante del sorteo.
	useLayoutEffect(() => {
		const root = tray.current, age = draw ? performance.now() - draw.start : Infinity
		if (!root || reducedMotion() || age > PAREJAS_DURATION) return
		const count = current.length
		const animations = [...root.querySelectorAll('.parejas__nombre')].map((label, i) => label.animate([
			{ opacity: 0, transform: 'translateY(22px) scale(.4)' }, { opacity: 1, transform: 'translateY(-6px) scale(1.06)', offset: .65 }, { opacity: 1, transform: 'none' },
		], { duration: 560, delay: (openAt(count) + i * 0.08 + 0.1) * 1000, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'backwards' }))
		const flash = root.querySelector('.parejas__destello')?.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)', offset: .3 }, { opacity: 0, transform: 'scale(1.5)' }],
			{ duration: 800, delay: listAt(count) * 1000, easing: 'ease-out', fill: 'both' })
		for (const animation of [...animations, flash]) if (animation) animation.currentTime = age
	}, [draw?.at])

	// Sin WebGL, la tómbola plana hace el mismo recorrido: gira, caen las bolas y se abren.
	useLayoutEffect(() => {
		const root = flat.current, age = draw ? performance.now() - draw.start : Infinity
		if (!failed || !root || reducedMotion() || age > PAREJAS_DURATION) return
		const animations: Animation[] = []
		const spin = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(1080deg)' }]
		for (const part of root.querySelectorAll('.parejas-plano__gira')) animations.push(part.animate(spin, { duration: SPIN * 1000, easing: 'cubic-bezier(.65, 0, .35, 1)' }))
		root.querySelectorAll('.parejas-plano__bolita').forEach((ball, i) => animations.push(ball.animate([{ transform: 'none' }, { transform: `translate(${i % 2 ? 4 : -4}px, -${10 + i % 3 * 6}px)` }, { transform: 'none' }],
			{ duration: 260 + i % 3 * 40, iterations: Math.round(SPIN * 1000 / 300), easing: 'ease-in-out' })))
		root.querySelectorAll<SVGGElement>('.parejas-plano__bola').forEach((ball, i) => {
			const dx = Number(ball.dataset.x), cup = Number(ball.dataset.cup)
			animations.push(ball.animate([
				{ transform: `translate(${FLAT.gate.x - cup}px, ${FLAT.gate.y - FLAT.cupY}px)`, easing: 'ease-in' },
				{ transform: `translate(${FLAT.rampEnd.x - cup}px, ${FLAT.rampEnd.y - FLAT.cupY}px)`, offset: .65, easing: 'ease-out' },
				{ transform: `translate(${dx * 0.5}px, -14px)`, offset: .85 },
				{ transform: 'none' },
			], { duration: FALL * 1000, delay: ballStart(i) * 1000, fill: 'backwards' }))
			const lid = ball.querySelector('.parejas-plano__tapa')
			if (lid) animations.push(lid.animate([{ transform: 'none' }, { transform: 'translate(-4px, -9px) rotate(-28deg)' }], { duration: 420, delay: (openAt(root.querySelectorAll('.parejas-plano__bola').length) + i * 0.08) * 1000, easing: 'cubic-bezier(.3, .7, .3, 1)', fill: 'backwards' }))
		})
		for (const animation of animations) animation.currentTime = age
		return () => animations.forEach((animation) => animation.cancel())
	}, [draw?.at, failed])

	const shown = listed ? pairs : pairs.slice(0, -1)
	const byId = new Map(participants.map((p) => [p.id, p]))
	const remaining = remainingParticipants(participants, pairs)
	const left = remaining.length + (listed ? 0 : current.length)
	// La pareja nueva entra a la lista con un brillo breve; la lista baja hasta ella.
	useLayoutEffect(() => {
		const element = list.current
		if (!element) return
		element.scrollTop = element.scrollHeight
		if (!listed || !draw || reducedMotion() || performance.now() - draw.start > PAREJAS_DURATION + 300) return
		element.lastElementChild?.animate([{ transform: 'scale(.86)', filter: 'brightness(1.25)', boxShadow: '0 0 0 6px #ffc54a99' }, { transform: 'scale(1.04)', offset: .45 }, { transform: 'none', filter: 'none', boxShadow: '0 0 0 0 #ffc54a00' }],
			{ duration: 620, easing: 'cubic-bezier(.3, .7, .3, 1)' })
	}, [shown.length, listed])

	// El maestro guarda el sorteo en la figura para que todos lo vean. No entra al historial.
	const update = (props: Partial<ParejasShape['props']>) => editor.run(() => editor.updateShape<ParejasShape>({ id: shape.id, type: 'parejas', props }), { history: 'ignore' })
	const last = pairs.at(-1)
	const join = remaining.length === 1 && last?.length === 2
	const canDraw = !animating && (remaining.length >= 2 || join)
	const sortear = () => {
		if (!canDraw) return
		update({ pairs: join ? [...pairs.slice(0, -1), [...last!, remaining[0].id]] : [...pairs, drawPair(remaining, Math.random).map((p) => p.id)], drawnAt: Date.now() })
	}
	const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
	const guard = { onPointerDown: stop, onTouchStart: stop, onTouchEnd: stop }
	const labels = LABELS[Math.min(3, current.length) - 1] ?? []

	return <HTMLContainer className="parejas" style={{ width: shape.props.w, height: shape.props.h }}>
		<div className="parejas__contenido" style={{ width: PAREJAS_WIDTH, height: PAREJAS_HEIGHT, transform: `scale(${scale})` }}>
			<div className="parejas__escena" style={{ width: STAGE.width, height: STAGE.height }}>
				<canvas ref={canvas} className="parejas__lienzo" data-listo={!failed} aria-hidden="true" />
				{failed && <svg ref={flat} className="parejas__plano" viewBox={`0 0 ${STAGE.width} ${STAGE.height}`} aria-hidden="true"><FlatTombola drum={balls.drum} pair={balls.pair} /></svg>}
				<div ref={tray} key={draw?.at ?? 0} className="parejas__bandeja" style={failed ? { '--bandeja-x': `${FLAT.tray.x}px`, '--bandeja-y': `${FLAT.tray.y}px` } as CSSProperties : undefined}>
					<i className="parejas__destello" />
					{current.map((id, i) => <span key={id} className="parejas__nombre" style={{ '--dx': `${labels[i]?.[0] ?? 0}px`, '--dy': `${labels[i]?.[1] ?? -80}px` } as CSSProperties}>{byId.get(id)?.name ?? '¿?'}</span>)}
				</div>
			</div>
			<section className="parejas__panel">
				<header className="parejas__cabeza">
					<span className="parejas__etiqueta"><Icon name="users" size={16} />Parejas</span>
					{isTeacher && <button type="button" className="parejas__icono" aria-label="Elegir participantes" title="Elegir participantes" {...guard} onClick={() => edit(shape)}><Icon name="edit" size={18} /></button>}
				</header>
				{title && <h2>{title}</h2>}
				{shown.length > 0
					? <ol ref={list} className="parejas__lista" data-denso={shown.length > 8}>{shown.map((pair, i) => <li key={pair.join()} data-ultima={i === shown.length - 1}>
						<b>{i + 1} ·</b> {pairLabel(pair.map((id) => byId.get(id)?.name ?? '¿?'))}
					</li>)}</ol>
					: <p className="parejas__vacio">{!participants.length ? isTeacher ? 'Elige quién entra con el lápiz.' : 'Aún no hay participantes.' : animating ? 'La tómbola está girando…' : 'Aún no hay parejas.'}</p>}
				<p className="parejas__estado">{animating ? 'Sorteando…' : left === 1 ? 'queda 1' : `quedan ${left}`}</p>
				{isTeacher && <div className="parejas__controles">
					<button type="button" className="parejas__boton" disabled={!canDraw} {...guard} onClick={sortear}><Icon name="dice" size={18} />{join ? 'Unir a la última pareja' : 'Sortear pareja'}</button>
					<button type="button" className="parejas__icono" aria-label="Reiniciar" title="Reiniciar: todos vuelven a la tómbola" disabled={!pairs.length || animating} {...guard}
						onClick={() => update({ pairs: [], drawnAt: 0, revision: uuid() })}><Icon name="rotate" size={18} /></button>
				</div>}
			</section>
		</div>
	</HTMLContainer>
}

// Tómbola plana, vista de frente, en un lienzo de 330 × 420.
const HUB = { x: 150, y: 168 }, RADIUS = 96
const FLAT = { gate: { x: 214, y: 246 }, rampEnd: { x: 248, y: 322 }, cupY: 335, cups: [[165], [100, 230], [100, 230, 165]], tray: { x: 165, y: 349 } }
const OCTAGON = Array.from({ length: 8 }, (_, k) => [HUB.x + RADIUS * Math.cos(Math.PI / 8 + k * Math.PI / 4), HUB.y + RADIUS * Math.sin(Math.PI / 8 + k * Math.PI / 4)])
const FLAT_PILE = (() => {
	const slots: [number, number][] = []
	for (let row = 0; slots.length < DRUM_BALLS; row++) {
		const y = 242 - row * 21, half = Math.sqrt(Math.max(0, 84 * 84 - (y - HUB.y) ** 2)) - 13, n = Math.max(1, Math.floor(half * 2 / 25) + 1)
		for (let i = 0; i < n; i++) slots.push([HUB.x + (i - (n - 1) / 2) * 25, y])
	}
	return slots
})()

function FlatBall({ ball, r }: { ball: Ball; r: number }) {
	// Al abrirse, la tapa se levanta y la inicial queda a la vista sobre la mitad de abajo.
	return <>
		<path className="parejas-plano__tapa" d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`} fill={ball.color} />
		<path d={`M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`} fill={ball.color} />
		<circle r={r * 0.58} fill="#fffdf7" />
		<text dy=".36em" textAnchor="middle" fontSize={r * 0.82} fontWeight={900} fontFamily="system-ui, sans-serif" fill="#8a3a2c">{ball.initial}</text>
	</>
}

function FlatTombola({ drum, pair }: { drum: Ball[]; pair: Ball[] }) {
	const cups = FLAT.cups[Math.min(3, pair.length) - 1] ?? []
	const outline = OCTAGON.map((p) => p.join(',')).join(' ')
	return <>
		<ellipse cx={165} cy={402} rx={140} ry={11} fill="#5c2a1e1a" />
		<rect x={40} y={388} width={260} height={12} rx={5} fill="#d3a676" />
		{[88, 212].map((x) => <line key={x} x1={HUB.x} y1={HUB.y} x2={x} y2={390} stroke="#d3a676" strokeWidth={11} strokeLinecap="round" />)}
		<polygon points={outline} fill="#ffe3d6" />
		{drum.map((ball, i) => FLAT_PILE[i] && <g key={ball.id} transform={`translate(${FLAT_PILE[i][0]} ${FLAT_PILE[i][1]})`}><g className="parejas-plano__bolita"><FlatBall ball={ball} r={11} /></g></g>)}
		<g className="parejas-plano__gira">
			<polygon points={outline} fill="none" stroke="#e9694f" strokeWidth={6} strokeLinejoin="round" />
			{OCTAGON.map(([x, y], k) => <line key={k} x1={HUB.x} y1={HUB.y} x2={x} y2={y} stroke="#e9694f" strokeWidth={2} opacity={0.5} />)}
			{OCTAGON.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={5} fill="#ffc54a" />)}
			<rect x={194} y={222} width={30} height={20} rx={4} fill="#e9694f" transform="rotate(-45 209 232)" />
		</g>
		<path d={`M ${FLAT.gate.x} ${FLAT.gate.y} L ${FLAT.rampEnd.x} ${FLAT.rampEnd.y}`} stroke="#e9694f" strokeWidth={18} strokeLinecap="round" />
		<path d={`M ${FLAT.gate.x} ${FLAT.gate.y} L ${FLAT.rampEnd.x} ${FLAT.rampEnd.y}`} stroke="#ff8a6e" strokeWidth={11} strokeLinecap="round" />
		<rect x={62} y={336} width={206} height={26} rx={12} fill="#ff8a6e" stroke="#e9694f" strokeWidth={3} />
		{FLAT.cups[2].map((x) => <ellipse key={x} cx={x} cy={343} rx={15} ry={5} fill="#6b3b35" />)}
		{pair.map((ball, i) => <g key={ball.id} transform={`translate(${cups[i]} ${FLAT.cupY})`}>
			<g className="parejas-plano__bola" data-x={FLAT.rampEnd.x - cups[i]} data-cup={cups[i]}><FlatBall ball={ball} r={15} /></g>
		</g>)}
		<g className="parejas-plano__gira">
			<line x1={HUB.x} y1={HUB.y} x2={HUB.x} y2={HUB.y - 58} stroke="#ffc54a" strokeWidth={8} strokeLinecap="round" />
			<circle cx={HUB.x} cy={HUB.y - 58} r={9} fill="#8a5a3b" />
		</g>
		<circle cx={HUB.x} cy={HUB.y} r={12} fill="#ffc54a" />
	</>
}
