import { useEffect, useRef } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor, useValue } from 'tldraw'
import { questionShapeProps, questionShapeMigrations, type QuestionShape } from '../../shared/questionShape'
import { Icon } from '../components/Icon'
import { useQuestion } from './QuestionContext'
import './questions.css'

export class QuestionShapeUtil extends BaseBoxShapeUtil<QuestionShape> {
	static override type = 'question' as const
	static override props = questionShapeProps
	static override migrations = questionShapeMigrations
	override getDefaultProps(): QuestionShape['props'] {
		return { points: 100, w: 480, h: 400, question: 'Escribe tu pregunta', answers: ['Respuesta A', 'Respuesta B', 'Respuesta C', 'Respuesta D'], correct: 0, answered: [], revision: crypto.randomUUID() }
	}
	override canEdit() { return false }
	override canResize() { return false }
	override getText(shape: QuestionShape) { return [shape.props.question, ...shape.props.answers].join('\n') }
	override component(shape: QuestionShape) { return <QuestionCard shape={shape} /> }
	override getIndicatorPath(shape: QuestionShape) {
		const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path
	}
	override toSvg(shape: QuestionShape) {
		return <foreignObject width={shape.props.w} height={shape.props.h}>
			<div style={{ background: '#fffdfa', color: '#24231f', padding: 24, height: '100%', boxSizing: 'border-box', border: '1px solid #bbb7ae', borderRadius: 16, font: '18px sans-serif' }}>
				<strong style={{ display: 'block', marginBottom: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{shape.props.question}</strong>
				{shape.props.answers.map((answer, index) => <div key={index} style={{ padding: 12, marginBottom: 8, border: '1px solid #bbb7ae', borderRadius: 8, overflowWrap: 'anywhere', background: shape.props.answered.includes(index) ? index === shape.props.correct ? '#d9f3df' : '#fbe1df' : '#f5f3ee' }}>{'ABCD'[index]}. {answer}</div>)}
			</div>
		</foreignObject>
	}
}

function QuestionCard({ shape }: { shape: QuestionShape }) {
	const { isTeacher, canAnswer, pending, answer, edit, feedback } = useQuestion()
	const buttons = useRef<(HTMLButtonElement | null)[]>([])
	const latest = feedback.filter((event) => event.shapeId === shape.id && event.revision === shape.props.revision).at(-1)
	useEffect(() => {
		if (!latest) return
		const button = buttons.current[latest.answer]
		if (!button) return
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		const frames = reduced ? [{ opacity: .6 }, { opacity: 1 }]
			: latest.correct ? [1, 1.045, .99, 1.012, 1].map((scale) => ({ transform: `scale(${scale})` }))
				: [0, -8, 7, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` }))
		const animation = button.animate(frames, { duration: reduced ? 180 : latest.correct ? 480 : 400, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' })
		return () => animation.cancel()
	}, [latest?.id])
	const editor = useEditor()
	const cursorActive = useValue('question cursor', () => editor.getCurrentToolId() === 'select', [editor])
	const interactive = !isTeacher && canAnswer && cursorActive
	const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
	return <HTMLContainer className="question-card" data-question-id={shape.id} data-interactive={interactive}>
		{latest?.correct && typeof latest.points === 'number' && <div key={latest.id} className="question-points" role="status" aria-label={`${latest.points} puntos ganados`}>+{latest.points}</div>}
		<div className="question-card__title"><h2>{shape.props.question}</h2>{isTeacher && <button type="button" className="question-card__edit" aria-label="Editar pregunta" title="Editar pregunta" onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onClick={() => edit(shape)}><Icon name="edit" size={20} /></button>}</div>
		<div className="question-card__answers">
			{shape.props.answers.map((label, index) => {
				const chosen = shape.props.answered.includes(index)
				const result = chosen ? index === shape.props.correct ? 'correct' : 'incorrect' : 'none'
				return <button key={index} ref={(button) => { buttons.current[index] = button }} type="button" className="question-answer" data-result={result}
					disabled={!interactive || pending || chosen} onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onClick={() => answer(shape, index)}>
					<span className="question-answer__letter">{'ABCD'[index]}</span><span>{label}</span>
					{chosen && <span className="question-answer__result">{result === 'correct' ? '✓ Correcta' : '× Incorrecta'}</span>}
				</button>
			})}
		</div>
	</HTMLContainer>
}
