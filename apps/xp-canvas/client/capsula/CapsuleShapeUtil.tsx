import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor } from 'tldraw'
import { CAPSULE_STAKE_MAX, capsuleClosed, capsulePot, capsuleShapeProps, type CapsuleShape } from '../../shared/capsuleShape'
import { Icon } from '../components/Icon'
import { formatOpensAt, useCapsule } from './CapsuleContext'
import './capsula.css'

// Medidas de diseño, como el buzón: la figura escala todo el contenido.
export const CAPSULE_WIDTH = 440
export const CAPSULE_HEIGHT = 720
const LETTERS = ['A', 'B', 'C', 'D']

export class CapsuleShapeUtil extends BaseBoxShapeUtil<CapsuleShape> {
	static override type = 'capsule' as const
	static override props = capsuleShapeProps
	override getDefaultProps(): CapsuleShape['props'] {
		return { w: CAPSULE_WIDTH, h: CAPSULE_HEIGHT, question: '¿Qué va a pasar?', outcomes: ['Sí', 'No'], opensAt: 0, status: 'draft', revision: crypto.randomUUID(), counts: [0, 0], stakes: [0, 0], read: 0,
			drawnId: '', drawnName: '', drawnOutcome: -1, drawnStake: 0, drawnReason: '', drawnBonus: 0, winner: -1, payouts: [] }
	}
	override canEdit() { return false }
	override isAspectRatioLocked() { return true }
	override getText(shape: CapsuleShape) { return [shape.props.question, ...shape.props.outcomes].join('\n') }
	override getIndicatorPath(shape: CapsuleShape) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w, shape.props.h, 16 * shape.props.w / CAPSULE_WIDTH); return p }
	override component(shape: CapsuleShape) { return <Capsule shape={shape} /> }
	override toSvg(shape: CapsuleShape) {
		return <g transform={`scale(${shape.props.w / CAPSULE_WIDTH})`}>
			<rect width={CAPSULE_WIDTH} height={CAPSULE_HEIGHT} rx={16} fill="#fffdfa" stroke="#c9c5bc" />
			<text x={24} y={46} fontSize={13} fill="#6b6861">Cápsula</text>
			<foreignObject x={24} y={56} width={392} height={120}><div style={{ font: '600 22px sans-serif', color: '#24231f', overflowWrap: 'anywhere' }}>{shape.props.question}</div></foreignObject>
			<g transform="translate(100 200)"><CapsuleDrawing bets={shape.props.counts.reduce((a, b) => a + b, 0)} lid={shape.props.status === 'draft' ? 'off' : 'sealed'} /></g>
		</g>
	}
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Reloj que avanza cada medio minuto: la cápsula se cierra sola a la hora de clase. */
function useNow() {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
	return now
}

function Capsule({ shape }: { shape: CapsuleShape }) {
	const editor = useEditor()
	const { isTeacher, enabled, mine, bet, draw, bonus, resolve, list, edit } = useCapsule()
	const { question, outcomes, opensAt, status, counts, stakes, read, drawnId, drawnName, drawnOutcome, drawnStake, drawnReason, drawnBonus, winner, payouts } = shape.props
	const now = useNow()
	// El reloj solo fuerza el repintado; la hora real decide, también cuando Leo acaba de mover opensAt.
	const closed = capsuleClosed(shape.props, Math.max(now, Date.now()))
	const total = counts.reduce((a, b) => a + b, 0), pot = capsulePot(stakes)
	const my = mine[shape.id]?.revision === shape.props.revision ? mine[shape.id] : undefined
	const [busy, setBusy] = useState(false)
	const [resolving, setResolving] = useState(false)
	const lid = useRef<SVGGElement>(null), bowl = useRef<SVGGElement>(null)
	const previous = useRef({ total, drawnId })

	// Llega una apuesta: el boleto cae y la cápsula rebota.
	useEffect(() => {
		const before = previous.current.total
		previous.current.total = total
		if (total <= before || reducedMotion()) return
		bowl.current?.animate([{ transform: 'scale(1, 1)' }, { transform: 'scale(1.05, .94)', offset: .35 }, { transform: 'scale(.98, 1.02)', offset: .7 }, { transform: 'scale(1, 1)' }], { duration: 460, easing: 'ease-out' })
	}, [total])
	// Sale una apuesta: la tapa se levanta y vuelve a caer.
	useEffect(() => {
		const before = previous.current.drawnId
		previous.current.drawnId = drawnId
		if (!drawnId || drawnId === before || reducedMotion()) return
		lid.current?.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-46px) rotate(-7deg)', offset: .3 }, { transform: 'translateY(-46px) rotate(-7deg)', offset: .75 }, { transform: 'translateY(0) rotate(0deg)' }], { duration: 1400, easing: 'cubic-bezier(.3, .7, .3, 1)' })
	}, [drawnId])

	const update = (props: Partial<CapsuleShape['props']>) => editor.run(() => editor.updateShape<CapsuleShape>({ id: shape.id, type: 'capsule', props }), { history: 'ignore' })
	const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
	const guard = { onPointerDown: stop, onTouchStart: stop, onTouchEnd: stop }
	const run = async (task: () => Promise<void>) => { setBusy(true); try { await task() } finally { setBusy(false) } }
	const pin = () => {
		const scale = shape.props.w / CAPSULE_WIDTH
		editor.markHistoryStoppingPoint('pegar cápsula')
		editor.createShape({ type: 'note', x: shape.x + shape.props.w + 40 * scale, y: shape.y, props: { color: 'yellow', size: 's', richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${question}\n${LETTERS[winner]}. ${outcomes[winner]}` }] }] } }, meta: { capsule: shape.id } })
	}

	const label = status === 'resolved' ? 'resuelta' : status === 'draft' ? '' : closed ? 'cerrada' : 'sellada'
	const hora = status === 'resolved' ? (stakes[winner] > 0 ? `${(pot / stakes[winner]).toFixed(2)} por punto` : 'nadie acertó')
		: status === 'draft' ? '' : closed ? `${total} ${total === 1 ? 'apuesta' : 'apuestas'} · bote ${pot}` : `se abre ${formatOpensAt(opensAt, now)}`
	const showDrawn = drawnId && status !== 'draft'

	return <HTMLContainer className="capsula" style={{ width: shape.props.w, height: shape.props.h }}>
		<div className="capsula__contenido" data-estado={status === 'resolved' ? 'resuelta' : status === 'draft' ? 'borrador' : closed ? 'cerrada' : 'abierta'} style={{ width: CAPSULE_WIDTH, height: CAPSULE_HEIGHT, transform: `scale(${shape.props.w / CAPSULE_WIDTH})` }}>
			<header className="capsula__cabeza">
				<span className="capsula__etiqueta"><CapsuleIcon />Cápsula{label && <b>{label}</b>}</span>
				{hora ? <span className="capsula__hora">{hora}</span> : isTeacher && <button type="button" className="capsula__icono" aria-label="Editar la cápsula" title="Editar la cápsula" {...guard} onClick={() => edit(shape)}><Icon name="edit" size={18} /></button>}
			</header>
			<h2>{question}</h2>
			<div className="capsula__escena">
				<svg viewBox="0 0 240 230" aria-hidden="true"><CapsuleDrawing bets={total} lid={status === 'draft' ? 'off' : status === 'resolved' ? 'open' : 'sealed'} lidRef={lid} bowlRef={bowl} winner={status === 'resolved' ? LETTERS[winner] : ''} /></svg>
				{status === 'sealed' && total > 0 && <span className="capsula__insignia">{total}</span>}
			</div>
			<ol className="capsula__salidas">
				{outcomes.map((outcome, index) => {
					const share = total ? counts[index] / total : 0
					const state = status === 'resolved' ? (index === winner ? 'gana' : 'pierde') : my?.outcome === index ? 'mia' : undefined
					return <li key={index} className="capsula__salida" data-estado={state}>
						<span className="capsula__letra">{LETTERS[index]}</span>
						<span className="capsula__texto">{outcome}</span>
						{status === 'resolved' ? (index === winner ? <span className="capsula__gana">gana</span> : <span className="capsula__cuenta">{stakes[index]}</span>)
							: resolving ? <button type="button" className="capsula__boton capsula__boton--gana" disabled={busy} {...guard} onClick={() => run(() => resolve(shape, index))}>Gana</button>
							: status === 'sealed' && <span className="capsula__cuenta">{counts[index]} · {stakes[index]}</span>}
						{status === 'sealed' && !resolving && <span className="capsula__barra"><i style={{ width: `${Math.round(share * 100)}%` }} /></span>}
					</li>
				})}
			</ol>
			{showDrawn && status !== 'resolved' && <div key={drawnId} className="capsula__hoja capsula__hoja--sorteada">
				<p>{drawnReason}</p>
				<footer>
					<span className="capsula__quien"><b>{drawnName}</b> · {LETTERS[drawnOutcome]} · {drawnStake}</span>
					{isTeacher
						? <button type="button" className="capsula__boton capsula__boton--premio" aria-pressed={drawnBonus > 0} disabled={busy || drawnBonus > 0 || !enabled} {...guard} onClick={() => run(() => bonus(shape, drawnId))}>{drawnBonus > 0 ? `Premiada, +${drawnBonus}` : 'Premiar ×1.5'}</button>
						: drawnBonus > 0 && <span className="capsula__premiada">explicación premiada, +{drawnBonus}</span>}
				</footer>
			</div>}
			{status === 'resolved' && payouts.length > 0 && <dl className="capsula__reparto">
				<div className="capsula__reparto-titulo"><dt>Fueron por {LETTERS[winner]}</dt><dd>puso</dd><dd>cobra</dd></div>
				{payouts.map((row, index) => <div key={index}><dt>{row.name}</dt><dd>{row.stake}</dd><dd>{row.paid}</dd></div>)}
			</dl>}
			{!isTeacher && status === 'sealed' && !closed && my && <div className="capsula__hoja">
				<p>{my.reason || <i>sin porqué</i>}</p>
				<footer><span>tu apuesta: {LETTERS[my.outcome]} · {my.stake} de {CAPSULE_STAKE_MAX}</span></footer>
			</div>}
			<p className="capsula__estado">{status === 'draft' ? (opensAt ? `Se abre ${formatOpensAt(opensAt, now)}` : 'Sin hora todavía')
				: status === 'resolved' ? `Bote de ${pot} repartido`
				: closed ? `${read} ${read === 1 ? 'leída' : 'leídas'} · ${Math.max(0, total - read)} sin leer`
				: <>{total} {total === 1 ? 'apuesta' : 'apuestas'} · bote <b>{pot}</b></>}</p>
			{isTeacher ? <div className="capsula__controles">
				{status === 'draft' && <button type="button" className="capsula__boton capsula__boton--principal" disabled={!opensAt || opensAt <= now} {...guard} onClick={() => update({ status: 'sealed' })}><Icon name="lock" size={18} />Sellar</button>}
				{status === 'sealed' && !resolving && <>
					<button type="button" className="capsula__boton capsula__boton--principal" disabled={!enabled || busy} {...guard} onClick={() => run(() => draw(shape))}><Icon name="dice" size={18} />{drawnId ? 'Otra apuesta' : 'Sortear'}</button>
					<button type="button" className="capsula__boton" disabled={!enabled || busy} {...guard} onClick={() => setResolving(true)}>Resolver</button>
					<button type="button" className="capsula__icono" aria-label="Ver todas las apuestas" title="Ver todas las apuestas" disabled={!enabled} {...guard} onClick={() => list(shape)}><Icon name="eye" size={18} /></button>
				</>}
				{status === 'sealed' && resolving && <button type="button" className="capsula__boton" {...guard} onClick={() => setResolving(false)}>Todavía no</button>}
				{status === 'resolved' && <button type="button" className="capsula__boton" {...guard} onClick={pin}><Icon name="pin" size={18} />Pegar como pregunta de hoy</button>}
				{status !== 'resolved' && <button type="button" className="capsula__icono" aria-label="Editar la cápsula" title="Editar la cápsula" {...guard} onClick={() => edit(shape)}><Icon name="edit" size={18} /></button>}
			</div> : status === 'sealed' && !closed && (enabled
				? <button type="button" className="capsula__apostar" {...guard} onClick={() => bet(shape)}>{my ? 'Cambiar apuesta' : 'Apostar'}</button>
				: <p className="capsula__cerrado">Entra con tu cuenta para apostar</p>)}
			{!isTeacher && status === 'sealed' && closed && <p className="capsula__cerrado"><Icon name="lock" size={16} />Se abre en clase</p>}
			{!isTeacher && status === 'draft' && <p className="capsula__cerrado">Leo todavía no la sella</p>}
		</div>
	</HTMLContainer>
}

function CapsuleIcon() {
	return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0Z" fill="#ec6a1e" stroke="#ec6a1e" /><path d="M4 13a8 8 0 0 0 16 0Z" /></svg>
}

const TICKETS: [number, number, number][] = [[70, 150, -12], [118, 156, 9], [92, 168, 4], [136, 138, -22], [60, 128, 18], [104, 130, -6], [80, 148, 26], [128, 172, -14], [56, 166, -30], [98, 112, 14], [142, 118, -8], [64, 108, -18]]

/** La cápsula en un lienzo de 240 × 230: plástico translúcido abajo, tapa naranja arriba. Los boletos se apilan con cada apuesta. */
export function CapsuleDrawing({ bets, lid, lidRef, bowlRef, winner = '' }: { bets: number; lid: 'off' | 'sealed' | 'open'; lidRef?: React.Ref<SVGGElement>; bowlRef?: React.Ref<SVGGElement>; winner?: string }) {
	const shown = Math.min(TICKETS.length, bets)
	return <>
		<defs><clipPath id="capsula-fondo"><path d="M48 118 A72 72 0 0 0 192 118 Z" /></clipPath></defs>
		<ellipse cx="120" cy="222" rx="72" ry="7" fill="#5c2a1e1a" />
		<g ref={bowlRef} className="capsula__fondo">
			<g clipPath="url(#capsula-fondo)">
				{TICKETS.slice(0, shown).map(([x, y, angle], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${angle} 20 13)`}>
					<rect x="1" y="1" width="38" height="24" rx="3" fill="#fffdf7" stroke="#c9b99c" strokeWidth="1.5" />
					<path d="M8 9h22M8 14h16M8 19h10" stroke="#9fb3c8" strokeWidth="1.6" strokeLinecap="round" />
					<circle cx="31" cy="18" r="3.2" fill="#078aa3" />
				</g>)}
			</g>
			<path d="M48 118 A72 72 0 0 0 192 118 Z" fill="#fff6e8" fillOpacity=".55" stroke="#d9c7a8" strokeWidth="3" strokeLinejoin="round" />
			<path d="M70 158 Q86 178 110 180" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".9" />
		</g>
		{lid === 'open' && <>
			<g transform="translate(214 150) rotate(-10)"><path d="M-52 0 A52 52 0 0 0 52 0 Z" fill="#ec6a1e" stroke="#b1452f" strokeWidth="3" strokeLinejoin="round" /><path d="M-52 0 A52 52 0 0 0 52 0 Z" fill="#000" opacity=".18" /></g>
			{winner && <g transform="translate(120 70)"><circle r="19" fill="#ec6a1e" /><text y="8" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff" fontFamily="inherit">{winner}</text></g>}
		</>}
		{lid !== 'open' && <g ref={lidRef} className="capsula__tapa" data-suelta={lid === 'off'}>
			<path d="M48 112 A72 72 0 0 1 192 112 Z" fill="#ec6a1e" stroke="#b1452f" strokeWidth="3" strokeLinejoin="round" />
			<path d="M66 86 Q76 60 104 52" fill="none" stroke="#ffb98f" strokeWidth="6" strokeLinecap="round" />
		</g>}
		<rect x="44" y="110" width="152" height="10" rx="5" fill="#24231f" />
		{lid === 'sealed' && <><circle cx="120" cy="115" r="14" fill="#078aa3" stroke="#fffdfa" strokeWidth="3" /><path d="m114 115 4 4 8-8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></>}
	</>
}
