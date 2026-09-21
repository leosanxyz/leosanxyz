import { useState } from 'react'
import { createShapeId, type Editor } from 'tldraw'
import type { QuestionShape } from '../../shared/questionShape'
import { Modal } from '../components/Modal'

export function QuestionDialog({ editor, shape, onClose }: { editor: Editor; shape: QuestionShape | null; onClose: () => void }) {
	const [question, setQuestion] = useState(shape?.props.question ?? '')
	const [answers, setAnswers] = useState(shape?.props.answers ?? ['', '', '', ''])
	const [correct, setCorrect] = useState(shape?.props.correct ?? 0)
	const [points, setPoints] = useState(String(shape?.props.points ?? 100))
	const validPoints = points.trim() !== '' && Number.isInteger(Number(points)) && Number(points) >= 0 && Number(points) <= 1_000_000
	const valid = validPoints && question.trim() && answers.every((answer) => answer.trim())
	return <Modal title={shape ? 'Editar pregunta' : 'Nueva pregunta'} onClose={onClose}>
		<form className="xp-form question-form" onSubmit={(event) => {
			event.preventDefault(); if (!valid) return
			const props = { points: Number(points), question: question.trim(), answers: answers.map((answer) => answer.trim()), correct, answered: [], revision: crypto.randomUUID(), h: Math.max(340, 240 + question.split('\n').reduce((height, line) => height + Math.max(1, Math.ceil(line.length / 28)) * 30, 0) + answers.reduce((height, answer) => height + Math.ceil(answer.length / 24) * 24, 0)) }
			editor.markHistoryStoppingPoint('question')
			if (shape) {
				if (!editor.getShape(shape.id)) { onClose(); return }
				editor.updateShape<QuestionShape>({ id: shape.id, type: 'question', props })
			} else {
				const id = createShapeId(), center = editor.getViewportPageBounds().center
				editor.createShape<QuestionShape>({ id, type: 'question', x: center.x - 240, y: center.y - props.h / 2, props })
				editor.setCurrentTool('select').select(id)
			}
			onClose()
		}}>
			<label>Pregunta<textarea autoFocus maxLength={300} rows={3} required value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
			<fieldset><legend>Respuestas · marca la correcta</legend>{answers.map((answer, index) => <div className="question-form__answer" key={index}>
				<input type="radio" name="correct" aria-label={`La respuesta ${'ABCD'[index]} es correcta`} checked={correct === index} onChange={() => setCorrect(index)} />
				<label><span>Respuesta {'ABCD'[index]}</span><input required maxLength={160} value={answer} onChange={(event) => setAnswers((current) => current.map((value, i) => i === index ? event.target.value : value))} /></label>
			</div>)}</fieldset>
			<label>Puntos por respuesta correcta<input type="number" min={0} max={1000000} step={1} required value={points} onChange={(event) => setPoints(event.target.value)} /></label>
			{shape && <p>Guardar reinicia los colores de esta pregunta.</p>}
			<div className="xp-dialog-actions">{shape && <button type="button" onClick={() => { editor.markHistoryStoppingPoint('reset question'); editor.updateShape<QuestionShape>({ id: shape.id, type: 'question', props: { answered: [], revision: crypto.randomUUID() } }); onClose() }}>Reiniciar respuestas</button>}<button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={!valid}>{shape ? 'Guardar' : 'Añadir al canvas'}</button></div>
		</form>
	</Modal>
}
