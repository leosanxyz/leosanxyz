import { useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import { SHOP_REVIEW_QUESTIONS, type ShopGrade, type ShopReview } from '../../shared/shop'
import { Icon } from '../components/Icon'
import { loadCelebrate, playCelebrate } from '../gachapon/gachaponSounds'

const LETTERS = 'ABCD'
const attempts = (count: number) => count === 1 ? 'Te queda 1 intento hoy.' : `Te quedan ${count} intentos hoy.`

/** One question at a time. The server grades the three together and keeps the key until then. */
export function ReviewSheet({ review, onGrade, onRetry, onGoToMachine, onClose }: {
	review: ShopReview
	onGrade: (answers: number[]) => Promise<ShopGrade>
	onRetry: () => Promise<void>
	onGoToMachine: () => void
	onClose: () => void
}) {
	return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
		<Dialog.Portal><Dialog.Overlay className="xp-dialog-overlay" /><Dialog.Content className="xp-dialog shop-review" aria-describedby={undefined} data-testid="shop-review">
			<div className="xp-dialog-heading"><Dialog.Title>Repaso</Dialog.Title><Dialog.Close className="xp-icon-button" aria-label="Cerrar"><Icon name="close" /></Dialog.Close></div>
			<Quiz key={review.id} review={review} onGrade={onGrade} onRetry={onRetry} onGoToMachine={onGoToMachine} />
		</Dialog.Content></Dialog.Portal>
	</Dialog.Root>
}

function Quiz({ review, onGrade, onRetry, onGoToMachine }: Omit<Parameters<typeof ReviewSheet>[0], 'onClose'>) {
	const [index, setIndex] = useState(0), [choices, setChoices] = useState<number[]>([])
	const [grade, setGrade] = useState<ShopGrade | null>(null)
	const [busy, setBusy] = useState(false), [error, setError] = useState('')
	const heading = useRef<HTMLHeadingElement>(null)
	useEffect(() => { loadCelebrate() }, [])
	// Move focus with each step so keyboard and screen reader users hear the new question or result.
	useEffect(() => { heading.current?.focus() }, [index, grade])
	const question = review.questions[index], choice = choices[index]
	const last = index === review.questions.length - 1

	async function next() {
		if (choice === undefined || busy) return
		if (!last) { setIndex(index + 1); return }
		setBusy(true); setError('')
		try {
			const result = await onGrade(choices)
			setGrade(result)
			if (result.passed) playCelebrate()
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude revisar tus respuestas.') }
		finally { setBusy(false) }
	}
	async function retry() {
		setBusy(true); setError('')
		try { await onRetry() } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude preparar otro repaso.'); setBusy(false) }
	}

	if (grade?.passed) return <div className="shop-review__result" data-passed="true">
		<div className="shop-review__token" aria-hidden="true"><span>XP</span></div>
		<h3 ref={heading} tabIndex={-1}>Tirada gratis desbloqueada</h3>
		<p>Acertaste las {SHOP_REVIEW_QUESTIONS}. Jala la palanca de la máquina para usarla.</p>
		<button className="xp-primary shop-review__action" onClick={onGoToMachine}>Ir a la máquina</button>
	</div>

	if (grade) return <div className="shop-review__result" data-passed="false">
		<h3 ref={heading} tabIndex={-1}>Casi</h3>
		<p>{grade.attemptsLeft ? `${attempts(grade.attemptsLeft)} Cada intento trae preguntas nuevas.` : 'Sin intentos por hoy. Mañana hay otra oportunidad.'}</p>
		<ol className="shop-review__marks">{review.questions.map((item, i) => <li key={i} data-correct={grade.results[i].correct}>
			<span className="shop-review__mark" aria-label={grade.results[i].correct ? 'Correcta' : 'Incorrecta'}>{grade.results[i].correct ? '✓' : '✕'}</span>
			<div><strong>{item.question}</strong>
				{grade.results[i].correct ? <small>{item.answers[choices[i]]}</small>
					: <small>Elegiste «{item.answers[choices[i]]}». La correcta era <b>«{item.answers[grade.results[i].answer]}»</b>.</small>}</div>
		</li>)}</ol>
		{error && <p className="xp-error" role="alert">{error}</p>}
		{grade.attemptsLeft > 0 && <button className="xp-primary shop-review__action" disabled={busy} onClick={() => void retry()}>{busy ? 'Preparando…' : 'Intentar de nuevo'}</button>}
	</div>

	return <div className="shop-review__quiz">
		<div className="shop-review__progress" aria-hidden="true">{review.questions.map((_, i) => <i key={i} data-state={i < index ? 'done' : i === index ? 'current' : 'next'} />)}</div>
		<p className="shop-review__count">Pregunta {index + 1} de {review.questions.length}</p>
		<h3 ref={heading} tabIndex={-1} className="shop-review__question">{question.question}</h3>
		<div className="shop-review__answers" role="group" aria-label="Respuestas">
			{question.answers.map((answer, i) => <button key={i} className="shop-review__answer" aria-pressed={choice === i} disabled={busy}
				onClick={() => setChoices((current) => { const next = [...current]; next[index] = i; return next })}>
				<span aria-hidden="true">{LETTERS[i]}</span>{answer}
			</button>)}
		</div>
		{error && <p className="xp-error" role="alert">{error}</p>}
		<div className="shop-review__footer">
			{index > 0 && <button className="shop-review__back" disabled={busy} onClick={() => setIndex(index - 1)}>Anterior</button>}
			<button className="xp-primary shop-review__action" disabled={choice === undefined || busy} onClick={() => void next()}>{busy ? 'Revisando…' : last ? 'Revisar respuestas' : 'Siguiente'}</button>
		</div>
	</div>
}
