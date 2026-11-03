import { BoardPreview, useRevealOrder } from '../boards/BoardPreview'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { useBoardView } from '../boards/useBoardView'
import { SAMPLE_BOARDS, Skeleton } from '../components/Skeleton'
import { openCanvas } from '../navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { DropdownMenu } from 'radix-ui'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import type { Board } from '../../shared/boards'
import { portalRequest } from './api'

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

type Notice = { text: string; undo: () => Promise<void>; key: number }

export function StudentBoards() {
	const { library, error, reload } = useBoardLibrary()
	const [view, setView] = useBoardView()
	const thumbnails = useRevealOrder()
	// Clases, Mis canvas and the trash of their own canvases. Old links to "Recientes" or a folder land in Clases.
	const section = view === 'mine' || view === 'trash' ? view : 'all'
	const boards = (library?.boards ?? []).filter((board) => section === 'all' ? !board.ownerId : Boolean(board.ownerId) && Boolean(board.trashedAt) === (section === 'trash'))
		.sort((a, b) => (b.trashedAt ?? b.updatedAt) - (a.trashedAt ?? a.updatedAt))
	const [creating, setCreating] = useState(false), [notice, setNotice] = useState<Notice | null>(null), [actionError, setActionError] = useState('')
	useEffect(() => {
		if (!notice) return
		const timer = window.setTimeout(() => setNotice(null), 6000)
		return () => clearTimeout(timer)
	}, [notice])
	/** Only the student's own canvases move to the trash; the server refuses class canvases. */
	async function setTrashed(board: Board, trashed: boolean, undo = true) {
		setActionError('')
		try {
			await portalRequest(`canvases/${board.id}`, 'PATCH', { trashed })
			await reload()
			if (undo) setNotice({ text: trashed ? `«${board.name}» está en la papelera.` : `«${board.name}» volvió a Mis canvas.`, undo: () => setTrashed(board, !trashed, false), key: Date.now() })
		} catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No pude actualizar el canvas.') }
	}
	async function undoNotice() {
		if (!notice) return
		setNotice(null)
		await notice.undo()
	}
	const title = section === 'mine' ? 'Mis canvas' : section === 'trash' ? 'Papelera' : 'Clases'
	return <LibraryShell title={title} view={section} folders={[]} onViewChange={setView} testId="student-boards"
		actions={section === 'mine' ? <button className="xp-primary" disabled={!library} onClick={() => setCreating(true)}>Nuevo canvas</button> : undefined}>
		{error && <p role="alert" className="xp-error board-error">{error} <button className="portal-link" onClick={() => void reload()}>Reintentar</button></p>}
		{actionError && <p role="alert" className="xp-error board-error">{actionError}</p>}
		{(library || !error) && <Skeleton data={library && boards} id={`classes:${section}`} sample={SAMPLE_BOARDS} label="Cargando canvases">{(boards) => <div className="board-grid board-grid--student">
			{boards.map((board, index) => <article className="board-card" key={board.id} data-board-id={board.id}>
				<button className="board-card-open" disabled={Boolean(board.trashedAt)} onClick={() => openCanvas(board)} aria-label={`Abrir ${board.name}`}>
					<BoardPreview board={board} index={index} order={thumbnails} />
					<div className="board-card-caption"><strong>{board.name}</strong><time dateTime={new Date(board.updatedAt).toISOString()}>{dateFormat.format(board.updatedAt)}</time></div>
				</button>
				{board.ownerId && <DropdownMenu.Root><DropdownMenu.Trigger className="xp-icon-button board-card-menu" skullet-ignore="" aria-label={`Opciones de ${board.name}`}><Icon name="more" size={20} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu" align="end">
					{board.trashedAt
						? <DropdownMenu.Item className="xp-menu-item" onSelect={() => void setTrashed(board, false)}>Restaurar</DropdownMenu.Item>
						: <DropdownMenu.Item className="xp-menu-item xp-menu-item--danger" onSelect={() => void setTrashed(board, true)}>Mover a la papelera</DropdownMenu.Item>}
				</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
			</article>)}
		</div>}</Skeleton>}
		{library && !boards.length && <p className="board-empty">{section === 'mine' ? 'Todavía no tienes canvas propios. Crea uno o pídele a tu agente que lo haga.' : section === 'trash' ? 'La papelera está vacía.' : 'Todavía no tienes clases.'}</p>}
		{notice && <div className="board-toast" role="status" key={notice.key}><span>{notice.text}</span><button onClick={() => void undoNotice()}>Deshacer</button></div>}
		{creating && <NewCanvas onClose={() => setCreating(false)} />}
	</LibraryShell>
}

function NewCanvas({ onClose }: { onClose: () => void }) {
	const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
	async function submit(event: FormEvent) {
		event.preventDefault(); if (busy) return
		setBusy(true); setError('')
		try { openCanvas(await portalRequest<Board>('canvases', 'POST', { name })) }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude crear el canvas.'); setBusy(false) }
	}
	return <Modal title="Nuevo canvas" onClose={() => { if (!busy) onClose() }}><form className="xp-form" onSubmit={submit}>
		<label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Por ejemplo, mi mod de zombies" required autoFocus /></label>
		{error && <p className="xp-error" role="alert">{error}</p>}
		<div className="xp-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear'}</button></div>
	</form></Modal>
}
