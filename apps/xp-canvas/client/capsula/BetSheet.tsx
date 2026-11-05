import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'
import { CAPSULE_REASON_MAX, CAPSULE_STAKE_MAX, cleanReason, reasonLength, type CapsuleBet, type CapsuleReply, type CapsuleShape } from '../../shared/capsuleShape'
import { boardRequest } from '../boards/api'
import { portalRequest } from '../portal/api'
import { Modal } from '../components/Modal'

const LETTERS = ['A', 'B', 'C', 'D']

/** La hoja para apostar: una salida, de 0 a 100 puntos y el porqué en 140 caracteres. Se puede cambiar hasta la hora de clase. */
export function BetSheet({ editor, roomId, shape, current, onPlaced, onClose }: { editor: Editor; roomId: string; shape: CapsuleShape; current?: CapsuleBet; onPlaced: (bet: CapsuleBet) => void; onClose: () => void }) {
	const [outcome, setOutcome] = useState(current?.outcome ?? -1)
	const [stake, setStake] = useState(current?.stake ?? 0)
	const [reason, setReason] = useState(current?.reason ?? '')
	const [points, setPoints] = useState<number | null>(null)
	const [error, setError] = useState('')
	const [sending, setSending] = useState(false)
	useEffect(() => { void portalRequest<{ points: number }>('points').then((reply) => setPoints(reply.points)).catch(() => {}) }, [])
	const length = reasonLength(reason.trim())
	// Lo ya apostado en esta cápsula vuelve al saldo si cambias el monto.
	const available = points === null ? null : points + (current?.stake ?? 0)
	const max = Math.min(CAPSULE_STAKE_MAX, available ?? CAPSULE_STAKE_MAX)
	const ready = outcome >= 0 && cleanReason(reason) !== null && !sending && stake <= max

	async function send() {
		const clean = cleanReason(reason)
		const live = editor.getShape<CapsuleShape>(shape.id)
		if (outcome < 0 || clean === null || sending) return
		if (!live) { setError('Esta cápsula ya no existe.'); return }
		setSending(true); setError('')
		try {
			const reply = await boardRequest<CapsuleReply>(`boards/${roomId}/interactions`, 'POST', { action: 'capsule-bet', shapeId: shape.id, revision: live.props.revision, outcome, stake, reason: clean })
			if (reply.type === 'capsule-bet') onPlaced(reply.bet)
			onClose()
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude guardar la apuesta.') }
		finally { setSending(false) }
	}

	return <Modal title={current ? 'Cambiar apuesta' : 'Apostar'} onClose={onClose}>
		<form className="apuesta" onSubmit={(event) => { event.preventDefault(); void send() }}>
			<p className="apuesta__nota"><b>{shape.props.question}</b></p>
			<ol className="apuesta__salidas" aria-label="Salidas">
				{shape.props.outcomes.map((text, index) => <li key={index}>
					<button type="button" className="apuesta__salida" aria-pressed={outcome === index} onClick={() => setOutcome(index)}><span className="capsula__letra">{LETTERS[index]}</span><span>{text}</span></button>
				</li>)}
			</ol>
			<div className="apuesta__monto">
				<div className="apuesta__stepper" role="group" aria-label="Puntos que apuestas">
					<button type="button" aria-label="Menos" disabled={stake <= 0} onClick={() => setStake(Math.max(0, stake - 10))}>−</button>
					<input type="number" inputMode="numeric" min={0} max={max} value={stake} aria-label="Puntos" onChange={(event) => setStake(Math.max(0, Math.min(max, Math.floor(Number(event.target.value) || 0))))} />
					<button type="button" aria-label="Más" disabled={stake >= max} onClick={() => setStake(Math.min(max, stake + 10))}>+</button>
				</div>
				<span className="apuesta__saldo">de {CAPSULE_STAKE_MAX}{available !== null && ` · tienes ${available.toLocaleString('es-MX')}`}</span>
			</div>
			<label className="apuesta__porque">
				<span className="xp-sr-only">Tu porqué</span>
				<textarea autoFocus={outcome >= 0} maxLength={CAPSULE_REASON_MAX * 2} rows={3} value={reason} placeholder="Tu porqué, en una frase. Si sales sorteado, lo explicas en clase." onChange={(event) => setReason(event.target.value)}
					onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() } }} />
				<span className="apuesta__cuenta" data-limite={length > CAPSULE_REASON_MAX ? 'pasado' : undefined}>{length} / {CAPSULE_REASON_MAX}</span>
			</label>
			<p className="apuesta__nota">Apostar cero también entra al sorteo. Si aciertas, el bote se reparte entre quienes acertaron según lo que pusieron. Puedes cambiar de salida y de monto hasta que se abra.</p>
			{error && <p className="xp-error" role="alert">{error}</p>}
			<div className="xp-dialog-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={!ready}>{outcome >= 0 ? `Apostar ${stake} a ${LETTERS[outcome]}` : 'Elige una salida'}</button></div>
		</form>
	</Modal>
}
