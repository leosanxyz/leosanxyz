import { BoardPreview, useRevealOrder } from '../boards/BoardPreview'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { useBoardView } from '../boards/useBoardView'
import { BoardCardsSkeleton, revealDelay, useReveal } from '../components/Skeleton'
import { navigate } from '../navigation'
import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import type { Board } from '../../shared/boards'
import { portalRequest } from './api'

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

export function StudentBoards() {
	const { library, error, reload } = useBoardLibrary()
	const [view, setView] = useBoardView()
	const reveal = useReveal(Boolean(library))
	const thumbnails = useRevealOrder()
	// Two sections and no folders. Old links to "Recientes" or a folder land in Clases.
	const mine = view === 'mine'
	const boards = (library?.boards ?? []).filter((board) => mine ? Boolean(board.ownerId) : !board.ownerId).sort((a, b) => b.updatedAt - a.updatedAt)
	const [creating, setCreating] = useState(false)
	return <LibraryShell title={mine ? 'Mis canvas' : 'Clases'} view={mine ? 'mine' : 'all'} folders={[]} onViewChange={setView} testId="student-boards"
		actions={mine ? <button className="xp-primary" disabled={!library} onClick={() => setCreating(true)}>Nuevo canvas</button> : undefined}>
		{error && <p role="alert" className="xp-error board-error">{error} <button className="portal-link" onClick={() => void reload()}>Reintentar</button></p>}
		<div className="board-grid board-grid--student" aria-busy={!library} data-reveal={reveal}>
			{boards.map((board, index) => <article className="board-card" key={board.id} data-board-id={board.id} style={revealDelay(reveal, index)}>
				<button className="board-card-open" onClick={() => navigate(`/board/${board.id}`)} aria-label={`Abrir ${board.name}`}>
					<BoardPreview board={board} index={index} order={thumbnails} />
					<div className="board-card-caption"><strong>{board.name}</strong><time dateTime={new Date(board.updatedAt).toISOString()}>{dateFormat.format(board.updatedAt)}</time></div>
				</button>
			</article>)}
			{!library && !error && <BoardCardsSkeleton />}
		</div>
		{library && !boards.length && <p className="board-empty">{mine ? 'Todavía no tienes canvas propios. Crea uno o pídele a tu agente que lo haga.' : 'Todavía no tienes clases.'}</p>}
		{creating && <NewCanvas onClose={() => setCreating(false)} />}
	</LibraryShell>
}

function NewCanvas({ onClose }: { onClose: () => void }) {
	const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
	async function submit(event: FormEvent) {
		event.preventDefault(); if (busy) return
		setBusy(true); setError('')
		try { navigate(`/board/${(await portalRequest<Board>('canvases', 'POST', { name })).id}`) }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude crear el canvas.'); setBusy(false) }
	}
	return <Modal title="Nuevo canvas" onClose={() => { if (!busy) onClose() }}><form className="xp-form" onSubmit={submit}>
		<label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Por ejemplo, mi mod de zombies" required autoFocus /></label>
		{error && <p className="xp-error" role="alert">{error}</p>}
		<div className="xp-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear'}</button></div>
	</form></Modal>
}
