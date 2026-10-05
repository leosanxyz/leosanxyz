import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, toRichText, useEditor } from 'tldraw'
import { mailboxShapeProps, type MailboxShape } from '../../shared/mailboxShape'
import { Icon } from '../components/Icon'
import { flying, sentKey, useMailbox } from './MailboxContext'
import { playMailbox, prepareMailboxAudio } from './mailboxSounds'
import { useMailbox3D } from './useMailbox3D'
import './mailbox.css'

// Medidas de diseño. La figura escala todo el contenido, así se ve igual a cualquier tamaño.
export const MAILBOX_WIDTH = 440
export const MAILBOX_HEIGHT = 560

export class MailboxShapeUtil extends BaseBoxShapeUtil<MailboxShape> {
	static override type = 'mailbox' as const
	static override props = mailboxShapeProps
	override getDefaultProps(): MailboxShape['props'] {
		return { w: MAILBOX_WIDTH, h: MAILBOX_HEIGHT, prompt: 'Escribe tu respuesta', open: false, round: 1, count: 0, drawn: 0, letter: '', letterId: '' }
	}
	override canEdit() { return false }
	override isAspectRatioLocked() { return true }
	override getText(shape: MailboxShape) { return [shape.props.prompt, shape.props.letter].filter(Boolean).join('\n') }
	override getIndicatorPath(shape: MailboxShape) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w, shape.props.h, 16 * shape.props.w / MAILBOX_WIDTH); return p }
	override component(shape: MailboxShape) { return <Mailbox shape={shape} /> }
	override toSvg(shape: MailboxShape) {
		return <g transform={`scale(${shape.props.w / MAILBOX_WIDTH})`}>
			<rect width={MAILBOX_WIDTH} height={MAILBOX_HEIGHT} rx={16} fill="#fffdfa" stroke="#c9c5bc" />
			<text x={24} y={46} fontSize={13} fill="#6b6861">Buzón</text>
			<foreignObject x={24} y={56} width={392} height={120}><div style={{ font: '600 22px sans-serif', color: '#24231f', overflowWrap: 'anywhere' }}>{shape.props.prompt}</div></foreignObject>
			<g transform="translate(100 200)"><MailboxDrawing /></g>
		</g>
	}
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const SQUASH = [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.06, .93)', offset: .3 }, { transform: 'scale(.98, 1.03)', offset: .65 }, { transform: 'scale(1, 1)' }]

function Mailbox({ shape }: { shape: MailboxShape }) {
	const editor = useEditor()
	const { isTeacher, enabled, authors, sent, write, draw, edit } = useMailbox()
	const { prompt, open, round, count, drawn, letter, letterId } = shape.props
	// Mientras vuela una carta propia, el conteo visible espera a que entre por la ranura.
	const [shownCount, setShownCount] = useState(count)
	const latestCount = useRef(count)
	latestCount.current = count
	const unread = Math.max(0, shownCount - drawn)
	const body = useRef<SVGGElement>(null), envelope = useRef<SVGGElement>(null), door = useRef<SVGGElement>(null), badge = useRef<SVGGElement>(null)
	const sheet = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), badgeHtml = useRef<HTMLSpanElement>(null)
	const [stageSize, setStageSize] = useState({ width: 396, height: 280 })
	const [moments, setMoments] = useState<{ arrivalAt: number | null; drawAt: number | null; landingAt: number | null }>({ arrivalAt: null, drawAt: null, landingAt: null })
	const status3d = useMailbox3D(canvas, { ...stageSize, ...moments, scale: shape.props.w / MAILBOX_WIDTH, full: unread > 0 })
	const pop = (delay: number) => {
		const frames = [{ transform: 'scale(.4)' }, { transform: 'scale(1.35)', offset: .5 }, { transform: 'scale(1)' }]
		for (const element of [badge.current, badgeHtml.current]) element?.animate(frames, { duration: 420, delay, easing: 'cubic-bezier(.3, .7, .3, 1)' })
	}
	useEffect(() => {
		const element = stage.current
		if (!element) return
		const observer = new ResizeObserver(() => setStageSize({ width: element.offsetWidth, height: element.offsetHeight }))
		observer.observe(element)
		return () => observer.disconnect()
	}, [])
	const [shown, setShown] = useState(letter ? { id: letterId, text: letter } : null)
	const [leaving, setLeaving] = useState(false)
	const [drawing, setDrawing] = useState(false)
	const previous = useRef({ count, letterId })
	const animateEntrance = useRef(false)
	useEffect(() => { prepareMailboxAudio() }, [])

	// Llega una carta: el sobre cae por la ranura, el buzón rebota y la bandera sube.
	useEffect(() => {
		const before = previous.current.count
		previous.current.count = count
		if (count > before && flying.has(shape.id)) return
		setShownCount(count)
		if (count <= before) return
		if (isTeacher) playMailbox('drop')
		setMoments((current) => ({ ...current, arrivalAt: performance.now() }))
		if (reducedMotion()) return
		const easing = 'cubic-bezier(.3, .7, .3, 1)'
		envelope.current?.animate([
			{ transform: 'translateY(-78px) rotate(-14deg)', opacity: 0 },
			{ transform: 'translateY(-40px) rotate(-3deg)', opacity: 1, offset: .4 },
			{ transform: 'translateY(-36px) rotate(0deg)', opacity: 1, offset: .55 },
			{ transform: 'translateY(30px) rotate(0deg)', opacity: 1 },
		], { duration: 820, easing })
		body.current?.animate(SQUASH, { duration: 460, delay: 640, easing: 'ease-out' })
		requestAnimationFrame(() => pop(700))
	}, [count, isTeacher, shape.id])

	// Quien envía ve su carta entrar por la ranura; el buzón rebota justo entonces.
	useEffect(() => {
		const landed = (event: Event) => {
			if ((event as CustomEvent<string>).detail !== shape.id) return
			setShownCount(latestCount.current)
			setMoments((current) => ({ ...current, landingAt: performance.now() }))
			if (reducedMotion()) return
			body.current?.animate(SQUASH, { duration: 460, easing: 'ease-out' })
			// La insignia aparece en este mismo cuadro; se anima en el siguiente.
			requestAnimationFrame(() => pop(0))
		}
		window.addEventListener('xp-mailbox-landed', landed)
		return () => window.removeEventListener('xp-mailbox-landed', landed)
	}, [shape.id])

	// El maestro saca una carta: se abre la puerta y la carta se despliega para todos.
	useEffect(() => {
		const before = previous.current.letterId
		previous.current.letterId = letterId
		if (letterId === before) return
		if (letter) {
			animateEntrance.current = true
			setShown({ id: letterId, text: letter }); setLeaving(false)
			if (isTeacher) playMailbox('open')
			setMoments((current) => ({ ...current, drawAt: performance.now() }))
			if (!reducedMotion()) door.current?.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(.08)', offset: .3 }, { transform: 'scaleX(.08)', offset: .7 }, { transform: 'scaleX(1)' }], { duration: 1100, easing: 'ease-in-out' })
		} else setLeaving(true)
	}, [letterId, letter, isTeacher])

	useLayoutEffect(() => {
		if (!shown || !animateEntrance.current || !sheet.current) return
		animateEntrance.current = false
		if (reducedMotion()) return
		sheet.current.animate([
			{ transform: 'translateY(96px) scale(.16) rotateX(78deg)', opacity: 0 },
			{ opacity: 1, offset: .2 },
			{ transform: 'translateY(-10px) scale(1.03) rotateX(0deg)', opacity: 1, offset: .72 },
			{ transform: 'none', opacity: 1 },
		], { duration: 760, delay: 260, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' })
	}, [shown?.id])

	useEffect(() => {
		if (!leaving) return
		const animation = reducedMotion() ? null : sheet.current?.animate([
			{ transform: 'none', opacity: 1 }, { transform: 'translateY(96px) scale(.16) rotateX(70deg)', opacity: 0 },
		], { duration: 360, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' })
		const done = () => { setShown(null); setLeaving(false) }
		if (!animation) { done(); return }
		animation.onfinish = done
		return () => { animation.onfinish = null }
	}, [leaving])

	// La ronda, abrir y la carta visible se guardan en la figura para que todos los vean. No entran al historial.
	const update = (props: Partial<MailboxShape['props']>) => editor.run(() => editor.updateShape<MailboxShape>({ id: shape.id, type: 'mailbox', props }), { history: 'ignore' })
	const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
	const guard = { onPointerDown: stop, onTouchStart: stop, onTouchEnd: stop }
	const pin = () => {
		if (!shown) return
		const pinned = editor.getCurrentPageShapes().filter((other) => other.type === 'note' && other.meta.mailbox === shape.id).length
		const scale = shape.props.w / MAILBOX_WIDTH
		editor.markHistoryStoppingPoint('pegar carta')
		editor.createShape({ type: 'note', x: shape.x + shape.props.w + 40 * scale + (pinned % 3) * 230, y: shape.y + Math.floor(pinned / 3) * 230,
			props: { richText: toRichText(shown.text), color: 'yellow', size: 's' }, meta: { mailbox: shape.id } })
	}
	const takeOut = async () => { setDrawing(true); try { await draw(shape) } finally { setDrawing(false) } }
	const mine = sent[sentKey(shape)] ?? 0
	const size = shown ? [...shown.text].length : 0

	return <HTMLContainer className="buzon" style={{ width: shape.props.w, height: shape.props.h }}>
		<div className="buzon__contenido" data-abierto={open} style={{ width: MAILBOX_WIDTH, height: MAILBOX_HEIGHT, transform: `scale(${shape.props.w / MAILBOX_WIDTH})` }}>
			<header className="buzon__cabeza">
				<span className="buzon__etiqueta"><Icon name="mail" size={16} />Buzón{round > 1 && <b>ronda {round}</b>}</span>
				{isTeacher && <button type="button" className="buzon__icono" aria-label="Editar la pregunta del buzón" title="Editar la pregunta" {...guard} onClick={() => edit(shape)}><Icon name="edit" size={18} /></button>}
			</header>
			<h2>{prompt}</h2>
			<div ref={stage} className="buzon__escena">
				<canvas ref={canvas} className="buzon__lienzo" data-listo={status3d === 'ready'} aria-hidden="true" />
				{status3d === 'ready'
					// La ranura y la insignia son HTML alineado con el dibujo 3D: la carta que se envía vuela a esta ranura.
					? <><i className="buzon__ranura" data-mailbox-slot={shape.id} />{unread > 0 && <span ref={badgeHtml} className="buzon__insignia3d">{unread}</span>}</>
					: <svg className="buzon__dibujo" viewBox="0 0 240 230" aria-hidden="true">
						<MailboxDrawing full={unread > 0} body={body} envelope={envelope} door={door} badge={badge} unread={unread} slotId={shape.id} />
					</svg>}
				{shown && <div key={shown.id} ref={sheet} className="buzon__carta" data-largo={size > 160 ? 'largo' : size > 80 ? 'medio' : 'corto'}>
					<p>{shown.text}</p>
					{isTeacher && <footer>
						<span>{authors[shown.id] === undefined ? '' : authors[shown.id] ? `de ${authors[shown.id]}` : 'sin nombre'}</span>
						<button type="button" className="buzon__icono" aria-label="Pegar en el canvas" title="Pegar en el canvas" {...guard} onClick={pin}><Icon name="pin" size={18} /></button>
						<button type="button" className="buzon__icono" aria-label="Guardar la carta" title="Guardar la carta" {...guard} onClick={() => update({ letter: '', letterId: '' })}><Icon name="close" size={18} /></button>
					</footer>}
				</div>}
			</div>
			<p className="buzon__estado">{shownCount === 1 ? '1 carta' : `${shownCount} cartas`}{isTeacher && shownCount > 0 && ` · ${drawn === 1 ? '1 leída' : `${drawn} leídas`}`}{!isTeacher && mine > 0 && ` · ${mine === 1 ? 'mandaste 1' : `mandaste ${mine}`}`}</p>
			{isTeacher ? <div className="buzon__controles">
				<button type="button" className="buzon__boton" aria-pressed={open} {...guard} onClick={() => update({ open: !open })}>{open ? 'Cerrar buzón' : 'Abrir buzón'}</button>
				<button type="button" className="buzon__boton buzon__boton--principal" disabled={!enabled || !unread || drawing} {...guard} onClick={takeOut}><Icon name="dice" size={18} />{shown ? 'Otra carta' : 'Sacar carta'}</button>
				<button type="button" className="buzon__icono" aria-label="Nueva ronda" title="Nueva ronda: el buzón se vacía y empieza de cero" disabled={!count || round >= 99} {...guard} onClick={() => update({ round: round + 1, count: 0, drawn: 0, letter: '', letterId: '' })}><Icon name="rotate" size={18} /></button>
				<button type="button" className="buzon__icono" aria-label="Escribir una carta" title="Escribir una carta" disabled={!enabled || !open} {...guard} onClick={() => write(shape)}><Icon name="mail" size={18} /></button>
			</div> : enabled && (open
				? <button type="button" className="buzon__escribir" {...guard} onClick={() => write(shape)}><Icon name="mail" size={20} />{mine ? 'Escribir otra carta' : 'Escribir una carta'}</button>
				: <p className="buzon__cerrado"><Icon name="lock" size={16} />El buzón está cerrado</p>)}
		</div>
	</HTMLContainer>
}

type Refs = { body?: React.Ref<SVGGElement>; envelope?: React.Ref<SVGGElement>; door?: React.Ref<SVGGElement>; badge?: React.Ref<SVGGElement> }

/** El buzón dibujado en un lienzo de 240 × 230. La bandera sube cuando hay cartas sin leer. */
function MailboxDrawing({ full = false, unread = 0, slotId, body, envelope, door, badge }: Refs & { full?: boolean; unread?: number; slotId?: string }) {
	const clip = `buzon-ranura-${slotId ?? 'svg'}`.replace(/[^a-zA-Z0-9-]/g, '-')
	return <>
		<defs><clipPath id={clip}><rect x="0" y="-200" width="240" height="277" /></clipPath></defs>
		<ellipse cx="120" cy="222" rx="72" ry="7" fill="#5c2a1e1a" />
		<rect x="110" y="150" width="20" height="74" rx="4" fill="#d3a676" stroke="#8a5a3b" strokeWidth="3" />
		<g ref={body} className="buzon__cuerpo">
			<path d="M 52 156 L 52 86 Q 52 36 120 36 Q 188 36 188 86 L 188 156 Q 188 164 180 164 L 60 164 Q 52 164 52 156 Z" fill="#ff8a6e" stroke="#e9694f" strokeWidth="4" strokeLinejoin="round" />
			<path d="M 68 92 Q 68 58 102 50" fill="none" stroke="#ffb7a3" strokeWidth="6" strokeLinecap="round" />
			<rect x="86" y="66" width="68" height="12" rx="6" fill="#6b3b35" data-mailbox-slot={slotId} />
			<g ref={door} className="buzon__puerta">
				<rect x="74" y="96" width="92" height="54" rx="10" fill="#ff977e" stroke="#e9694f" strokeWidth="3" />
				<circle cx="153" cy="123" r="4.5" fill="#ffc54a" stroke="#c9822b" strokeWidth="1.5" />
			</g>
			<g className="buzon__bandera" data-arriba={full}>
				<rect x="186" y="56" width="7" height="48" rx="3.5" fill="#8a5a3b" />
				<path d="M 193 56 L 220 56 Q 224 56 224 60 L 224 72 Q 224 76 220 76 L 193 76 Z" fill="#ffc54a" stroke="#c9822b" strokeWidth="2" strokeLinejoin="round" />
				<circle cx="189.5" cy="100" r="5" fill="#6b3b35" />
			</g>
		</g>
		<g clipPath={`url(#${clip})`}>
			<g ref={envelope} className="buzon__sobre" opacity="0">
				<rect x="98" y="50" width="44" height="30" rx="4" fill="#fffdf7" stroke="#c9b99c" strokeWidth="2" />
				<path d="M 99 52 L 120 68 L 141 52" fill="none" stroke="#c9b99c" strokeWidth="2" strokeLinejoin="round" />
				<circle cx="120" cy="68" r="4" fill="#e9694f" />
			</g>
		</g>
		{unread > 0 && <g ref={badge} className="buzon__insignia">
			<circle cx="60" cy="44" r="17" fill="#24231f" />
			<text x="60" y="50" textAnchor="middle" fontSize={unread > 99 ? 13 : 16} fontWeight="700" fill="#fffdfa">{unread}</text>
		</g>}
	</>
}
