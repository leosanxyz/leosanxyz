import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { cleanLetter, LETTER_MAX, letterLength, type MailboxReply, type MailboxShape } from '../../shared/mailboxShape'
import { boardRequest } from '../boards/api'
import { Icon } from '../components/Icon'
import { flying, sentKey } from './MailboxContext'
import { playMailbox } from './mailboxSounds'

// Lo escrito y no enviado sobrevive a cerrar la hoja, por buzón y ronda.
const drafts = new Map<string, string>()
// La última elección de firma se recuerda mientras la página esté abierta.
let signedLast = true
const FOLD = { duration: 520, easing: 'cubic-bezier(.45, .05, .25, 1)', fill: 'forwards' as const }
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Stage = 'writing' | 'folding' | 'flying'

export function LetterSheet({ editor, roomId, shape, name, isTeacher, onSent, onClose }: { editor: Editor; roomId: string; shape: MailboxShape; name: string; isTeacher: boolean; onSent: () => void; onClose: () => void }) {
	const key = sentKey(shape)
	const [text, setText] = useState(() => drafts.get(key) ?? '')
	const [stage, setStage] = useState<Stage>('writing')
	const [signed, setSigned] = useState(signedLast)
	useEffect(() => { signedLast = signed }, [signed])
	const [error, setError] = useState('')
	const layer = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null)
	const length = letterLength(text.trim())
	const ready = stage === 'writing' && !!cleanLetter(text)

	useEffect(() => { drafts.set(key, text) }, [key, text])
	useEffect(() => {
		if (stage !== 'writing') return
		const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
		window.addEventListener('keydown', escape)
		return () => window.removeEventListener('keydown', escape)
	}, [stage, onClose])

	async function send() {
		const letter = cleanLetter(text)
		const current = editor.getShape<MailboxShape>(shape.id)
		if (!letter || stage !== 'writing') return
		if (!current) { setError('Este buzón ya no existe.'); return }
		setError(''); setStage('folding')
		flying.add(shape.id)
		const request = boardRequest<MailboxReply>(`boards/${roomId}/interactions`, 'POST', { action: 'letter', shapeId: shape.id, round: current.props.round, text: letter, anonymous: !signed })
		// Espera a que existan los pliegues en el DOM antes de animarlos.
		await new Promise(requestAnimationFrame)
		const folded = reducedMotion() ? null : fold(sheet.current!)
		const [result] = await Promise.allSettled([request, folded?.done])
		if (result.status === 'rejected') {
			flying.delete(shape.id)
			await folded?.undo()
			setStage('writing')
			setError(result.reason instanceof Error ? result.reason.message : 'No pude enviar la carta.')
			return
		}
		drafts.delete(key)
		setStage('flying')
		let landed = false
		// El buzón reacciona en el instante en que la carta toca la ranura, no cuando termina el vuelo.
		const land = () => {
			if (landed) return
			landed = true
			if (!isTeacher) playMailbox('drop')
			flying.delete(shape.id)
			onSent()
			window.dispatchEvent(new CustomEvent('xp-mailbox-landed', { detail: shape.id }))
		}
		if (!reducedMotion()) await fly(layer.current!, sheet.current!, shape.id, land)
		land()
		onClose()
	}

	const content = (editable: boolean) => <div className="carta__contenido">
		<header><span>Para el buzón</span><strong>{shape.props.prompt}</strong></header>
		<div className="carta__renglones">
			{editable
				? <textarea aria-label="Tu carta" autoFocus maxLength={LETTER_MAX * 2} value={text} placeholder="Escribe aquí…" onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() } }} />
				: <div className="carta__texto">{text}</div>}
		</div>
		<div className="carta__pie">
			{editable && <div className="carta__firmar" role="group" aria-label="Firma">
				<button type="button" aria-pressed={signed} onClick={() => setSigned(true)}>Con mi nombre</button>
				<button type="button" aria-pressed={!signed} onClick={() => setSigned(false)}>Sin nombre</button>
			</div>}
			<span className="carta__firma">— {signed ? name : 'sin nombre'}</span>
		</div>
		<footer>
			<span className="carta__cuenta" data-limite={length > LETTER_MAX ? 'pasado' : length > LETTER_MAX - 30 ? 'cerca' : undefined}>{length}/{LETTER_MAX}</span>
			{editable && <>
				<button type="button" className="carta__boton" onClick={onClose}>Cancelar</button>
				<button type="button" className="carta__boton carta__boton--principal" disabled={!ready} onClick={() => void send()}><Icon name="mail" size={18} />Doblar y enviar</button>
			</>}
		</footer>
	</div>

	return <div ref={layer} className="carta-capa" role="dialog" aria-modal="true" aria-label="Escribir una carta" data-etapa={stage}
		onPointerDown={(event) => { if (event.target === event.currentTarget && stage === 'writing') onClose() }}>
		<div ref={sheet} className="carta">
			{stage === 'writing'
				? <div className="carta__hoja">{content(true)}</div>
				// Tres pliegues con la misma hoja recortada: el de abajo sube, el de arriba baja y queda el sello.
				: [1, 2, 0].map((index) => <div key={index} className="carta__pliegue" data-pliegue={index}>
					<div className="carta__cara">{content(false)}<i className="carta__sombra" /></div>
					<div className="carta__dorso">{index === 0 && <><span className="carta__para">para el buzón</span><span className="carta__sello">XP</span></>}<i className="carta__sombra" /></div>
				</div>)}
			{error && <p className="carta__error" role="alert">{error}</p>}
		</div>
	</div>
}

/** Dobla la hoja como carta: el tercio de abajo sube, el de arriba baja y aparece el sello. */
function fold(sheet: HTMLElement) {
	const part = (index: number) => sheet.querySelector<HTMLElement>(`[data-pliegue="${index}"]`)!
	const shade = (index: number, face: string) => part(index).querySelector<HTMLElement>(`${face} .carta__sombra`)!
	const seal = sheet.querySelector<HTMLElement>('.carta__sello')!
	const animations: Animation[] = []
	const run = (element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => { const animation = element.animate(frames, options); animations.push(animation); return animation.finished }
	const flip = (index: number, angle: number, delay: number) => {
		playLater('fold', delay)
		return Promise.all([
			run(part(index), [{ transform: 'perspective(1400px) rotateX(0deg)' }, { transform: `perspective(1400px) rotateX(${angle}deg)` }], { ...FOLD, delay }),
			// Se oscurece al levantarse y se aclara al caer del otro lado.
			run(shade(index, '.carta__cara'), [{ opacity: 0 }, { opacity: .3 }], { ...FOLD, duration: FOLD.duration / 2, delay }),
			run(shade(index, '.carta__dorso'), [{ opacity: .3 }, { opacity: 0 }], { ...FOLD, duration: FOLD.duration / 2, delay: delay + FOLD.duration / 2 }),
		])
	}
	const done = (async () => {
		await flip(2, 180, 0)
		await flip(0, -180, 60)
		playMailbox('seal')
		await run(seal, [{ transform: 'scale(0) rotate(-35deg)', opacity: 0 }, { transform: 'scale(1.22) rotate(8deg)', opacity: 1, offset: .6 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3, 1.4, .5, 1)', fill: 'forwards' })
	})()
	return {
		done,
		// Si el envío falla, la hoja se vuelve a abrir en orden inverso.
		undo: async () => {
			await done.catch(() => {})
			await Promise.all(animations.map((animation) => { animation.reverse(); return animation.finished.catch(() => {}) }))
		},
	}
}

function playLater(sound: 'fold', delay: number) { window.setTimeout(() => playMailbox(sound), delay) }

/** La carta doblada vuela en arco hasta la ranura y entra. Sin buzón a la vista, baja y se va. */
async function fly(layer: HTMLElement, sheet: HTMLElement, shapeId: string, onLand: () => void) {
	const slot = document.querySelector(`[data-mailbox-slot="${CSS.escape(shapeId)}"]`)?.getBoundingClientRect()
	const box = sheet.getBoundingClientRect()
	const visible = !!slot && slot.width > 2 && slot.bottom > 0 && slot.top < innerHeight && slot.right > 0 && slot.left < innerWidth
	const end = visible ? { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 } : { x: innerWidth / 2, y: innerHeight + 120 }
	const scale = visible ? Math.max(.04, Math.min(.5, slot.width * .9 / box.width)) : .3
	const dx = end.x - (box.left + box.width / 2), dy = end.y - (box.top + box.height / 2)
	playMailbox('fly')
	layer.animate([{ backgroundColor: '#2a201733' }, { backgroundColor: '#2a201700' }], { duration: 420, fill: 'forwards' })
	const duration = 980
	window.setTimeout(onLand, duration * .86)
	await sheet.animate([
		{ transform: 'translate(0, 0) rotate(0deg) scale(1)' },
		{ transform: `translate(${dx * .32}px, ${dy * .32 - 80}px) rotate(-9deg) scale(${.55 + scale * .3})`, offset: .42 },
		{ transform: `translate(${dx}px, ${dy - 4}px) rotate(0deg) scale(${scale})`, offset: .84 },
		{ transform: `translate(${dx}px, ${dy + box.height * scale * .25}px) rotate(0deg) scale(${scale}, ${scale * .12})`, opacity: 0 },
	], { duration, easing: 'cubic-bezier(.5, 0, .3, 1)', fill: 'forwards' }).finished
}
