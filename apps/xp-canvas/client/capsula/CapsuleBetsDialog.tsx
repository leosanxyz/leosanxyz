import { useEffect, useState } from 'react'
import type { CapsuleBet, CapsuleReply, CapsuleShape } from '../../shared/capsuleShape'
import { boardRequest } from '../boards/api'
import { Modal } from '../components/Modal'

const LETTERS = ['A', 'B', 'C', 'D']

/** Leo ve todas las apuestas boca arriba, con nombre, antes y después del sorteo. */
export function CapsuleBetsDialog({ roomId, shape, onClose }: { roomId: string; shape: CapsuleShape; onClose: () => void }) {
	const [bets, setBets] = useState<CapsuleBet[] | null>(null)
	const [error, setError] = useState('')
	useEffect(() => {
		const abort = new AbortController()
		boardRequest<CapsuleReply>(`boards/${roomId}/interactions`, 'POST', { action: 'capsule-list', shapeId: shape.id }, abort.signal)
			.then((reply) => { if (reply.type === 'capsule-bets') setBets(reply.bets.filter((bet) => bet.revision === shape.props.revision)) })
			.catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'No pude leer las apuestas.') })
		return () => abort.abort()
	}, [roomId, shape.id, shape.props.revision])
	return <Modal title={bets ? `${bets.length} ${bets.length === 1 ? 'apuesta' : 'apuestas'}` : 'Apuestas'} onClose={onClose}>
		{error && <p className="xp-error" role="alert">{error}</p>}
		{bets && !bets.length && <p className="apuesta__nota">Todavía nadie apuesta.</p>}
		{bets && bets.length > 0 && <ul className="apuestas">
			{bets.map((bet) => <li key={bet.id} data-leida={bet.drawnAt ? '' : undefined}>
				<span className="capsula__letra">{LETTERS[bet.outcome]}</span>
				<b>{bet.name}</b>
				<span className="apuestas__meta">{bet.stake} pts{bet.drawnAt ? ' · leída' : ''}{bet.bonus ? ` · +${bet.bonus}` : ''}</span>
				<p>{bet.reason || <i>sin porqué: no entra al sorteo</i>}</p>
			</li>)}
		</ul>}
	</Modal>
}
