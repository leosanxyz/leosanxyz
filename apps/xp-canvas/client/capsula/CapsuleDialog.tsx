import { useState } from 'react'
import { createShapeId, type Editor } from 'tldraw'
import { CAPSULE_OUTCOMES_MAX, type CapsuleShape } from '../../shared/capsuleShape'
import { Modal } from '../components/Modal'
import { CAPSULE_HEIGHT, CAPSULE_WIDTH } from './CapsuleShapeUtil'

const LETTERS = ['A', 'B', 'C', 'D']

/** Mañana a las 10:00, en hora local, para el campo datetime-local. */
function defaultOpensAt() {
	const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0)
	return date
}
const toLocalInput = (at: number) => { const d = new Date(at); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }

export function CapsuleDialog({ editor, shape, onClose }: { editor: Editor; shape: CapsuleShape | null; onClose: () => void }) {
	const [question, setQuestion] = useState(shape?.props.question ?? '')
	const [outcomes, setOutcomes] = useState<string[]>(shape?.props.outcomes ?? ['', ''])
	const [opensAt, setOpensAt] = useState(toLocalInput(shape?.props.opensAt || defaultOpensAt().getTime()))
	const sealed = shape?.props.status === 'sealed'
	const filled = outcomes.map((value) => value.trim()).filter(Boolean)
	const at = new Date(opensAt).getTime()
	const ready = question.trim() && filled.length >= 2 && filled.length === outcomes.length && Number.isFinite(at)
	return <Modal title={shape ? 'Editar cápsula' : 'Nueva cápsula'} onClose={onClose}>
		<form className="xp-form" onSubmit={(event) => {
			event.preventDefault(); if (!ready) return
			editor.markHistoryStoppingPoint('capsule')
			if (shape) {
				if (!editor.getShape(shape.id)) { onClose(); return }
				// Cambiar la pregunta o las salidas invalida lo apostado; cambiar solo la hora, no.
				const changed = !sealed && (question.trim() !== shape.props.question || filled.join('\n') !== shape.props.outcomes.join('\n'))
				editor.updateShape<CapsuleShape>({ id: shape.id, type: 'capsule', props: sealed ? { opensAt: at } : { question: question.trim(), outcomes: filled, opensAt: at,
					...changed && { revision: crypto.randomUUID(), counts: filled.map(() => 0), stakes: filled.map(() => 0) } } })
			} else {
				const id = createShapeId(), center = editor.getViewportPageBounds().center
				editor.createShape<CapsuleShape>({ id, type: 'capsule', x: center.x - CAPSULE_WIDTH / 2, y: center.y - CAPSULE_HEIGHT / 2,
					props: { question: question.trim(), outcomes: filled, opensAt: at, revision: crypto.randomUUID(), counts: filled.map(() => 0), stakes: filled.map(() => 0) } })
				editor.setCurrentTool('select').select(id)
			}
			onClose()
		}}>
			<label>Lo que nadie resolvió hoy<textarea autoFocus={!sealed} maxLength={200} rows={2} required disabled={sealed} value={question} placeholder="El jugador llega a la puerta sin llave. ¿Qué arregla el bug?" onChange={(event) => setQuestion(event.target.value)} /></label>
			<div className="xp-form" style={{ gap: 8 }}>
				{outcomes.map((value, index) => <label key={index}>Salida {LETTERS[index]}<input maxLength={120} required disabled={sealed} value={value} onChange={(event) => setOutcomes(outcomes.map((item, i) => i === index ? event.target.value : item))} /></label>)}
				{!sealed && <div className="xp-dialog-actions" style={{ justifyContent: 'flex-start' }}>
					{outcomes.length < CAPSULE_OUTCOMES_MAX && <button type="button" onClick={() => setOutcomes([...outcomes, ''])}>Otra salida</button>}
					{outcomes.length > 2 && <button type="button" onClick={() => setOutcomes(outcomes.slice(0, -1))}>Quitar la última</button>}
				</div>}
			</div>
			<label>Se abre en clase el<input type="datetime-local" required value={opensAt} onChange={(event) => setOpensAt(event.target.value)} /></label>
			<p>{sealed ? 'Está sellada: solo se puede mover la hora.' : 'Los alumnos apuestan desde que la selles hasta esa hora. Nadie ve los porqués hasta que sortees.'}</p>
			<div className="xp-dialog-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={!ready}>{shape ? 'Guardar' : 'Añadir al canvas'}</button></div>
		</form>
	</Modal>
}
