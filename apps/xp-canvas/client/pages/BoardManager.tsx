import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { DropdownMenu } from 'radix-ui'
import { type Board, type BoardFolder, type BoardLibrary } from '../../shared/boards'
import { closeEditorSession, getEditorSession } from '../access'
import { boardRequest } from '../boards/api'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardView } from '../boards/useBoardView'
import { EditorCodeDialog } from '../components/EditorCodeDialog'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { navigate } from '../navigation'
import '../boards/boards.css'
import { usePortal } from '../portal/PortalProvider'
import { BoardAccessDialog } from '../portal/BoardAccessDialog'

type DialogState = { kind: 'new-folder' | 'rename-board' | 'rename-folder' | 'move-board'; id?: string; name: string; folderId: string | null }
const emptyLibrary: BoardLibrary = { boards: [], folders: [] }
const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

export default function BoardManager() {
	const { mode } = usePortal()
	const [sharing, setSharing] = useState<Board | null>(null)
	const [isEditor, setIsEditor] = useState<boolean | null>(null)
	const [authRequired, setAuthRequired] = useState(true)
	const [unlock, setUnlock] = useState(false)
	const [library, setLibrary] = useState<BoardLibrary>(emptyLibrary)
	const [view, setView] = useBoardView()
	const [dialog, setDialog] = useState<DialogState | null>(null)
	const [busy, setBusy] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	useEffect(() => {
		let active = true
		void getEditorSession().then(({ isEditor, authRequired }) => { if (active) { setIsEditor(isEditor); setAuthRequired(authRequired) } }).catch(() => { if (active) { setIsEditor(false); setError('No pude conectar con el servidor.') } })
		return () => { active = false }
	}, [])

	const load = useCallback(async (signal?: AbortSignal) => {
		try {
			const result = await boardRequest<BoardLibrary>('library', 'GET', undefined, signal)
			if (!signal?.aborted) { setLibrary(result); setError('') }
		} catch (cause) { if (!signal?.aborted) setError(message(cause)) }
		finally { if (!signal?.aborted) setLoading(false) }
	}, [])

	useEffect(() => {
		if (!isEditor) return
		const abort = new AbortController()
		void load(abort.signal)
		const refresh = () => { if (!document.hidden) void load(abort.signal) }
		window.addEventListener('focus', refresh)
		document.addEventListener('visibilitychange', refresh)
		return () => { abort.abort(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
	}, [isEditor, load])

	const selectedFolder = library.folders.find((folder) => folder.id === view)
	const title = selectedFolder?.name ?? ({ all: 'Todos los canvases', recent: 'Recientes', favorites: 'Favoritos', trash: 'Papelera' }[view] ?? 'Todos los canvases')
	const boards = library.boards.filter((board) => {
		if (view === 'trash') return Boolean(board.trashedAt)
		if (board.trashedAt) return false
		if (view === 'favorites') return board.favorite
		if (selectedFolder) return board.folderId === selectedFolder.id
		return true
	}).sort((a, b) => b.updatedAt - a.updatedAt)

	async function updateBoard(board: Board, data: Partial<Board> | { trashed: boolean }) {
		try { await boardRequest(`boards/${board.id}`, 'PATCH', data); await load() }
		catch (cause) { setError(message(cause)) }
	}
	async function createBoard() {
		if (busy) return
		setBusy(true); setError('')
		try {
			const board = await boardRequest<Board>('boards', 'POST', { name: 'Sin título', folderId: selectedFolder?.id ?? null })
			navigate(`/board/${board.id}`)
		} catch (cause) { setError(message(cause)) }
		finally { setBusy(false) }
	}
	async function copyBoard(source: Board) {
		if (busy) return
		setBusy(true); setError('')
		try {
			const copy = await boardRequest<Board>(`boards/${source.id}/copy`, 'POST')
			if (view === 'favorites') setView(copy.folderId ?? 'all')
			await load()
		} catch (cause) { setError(message(cause)) }
		finally { setBusy(false) }
	}
	async function submitDialog(event: FormEvent) {
		event.preventDefault()
		if (!dialog || busy) return
		setBusy(true); setError('')
		try {
			if (dialog.kind === 'new-folder') {
				const folder = await boardRequest<BoardFolder>('folders', 'POST', { name: dialog.name, parentId: dialog.folderId })
				setView(folder.id)
			} else if (dialog.kind === 'move-board') await boardRequest(`boards/${dialog.id}`, 'PATCH', { folderId: dialog.folderId })
			else await boardRequest(`${dialog.kind === 'rename-board' ? 'boards' : 'folders'}/${dialog.id}`, 'PATCH', { name: dialog.name })
			await load(); setDialog(null)
		} catch (cause) { setError(message(cause)) }
		finally { setBusy(false) }
	}

	if (isEditor === null) return <div className="board-loading">Abriendo canvases…</div>
	if (!isEditor) return <div className="board-welcome"><Icon name="boards" size={46} /><h1>Tus canvases</h1><button className="xp-primary" onClick={() => setUnlock(true)}>Editar</button><a href="/board/principal" onClick={(event) => { event.preventDefault(); navigate('/board/principal') }}>Ver Principal</a>
		{error && <p className="xp-error" role="alert">{error}</p>}
		{unlock && <EditorCodeDialog onClose={() => setUnlock(false)} onUnlock={() => { setUnlock(false); setIsEditor(true) }} />}
	</div>

	return <LibraryShell title={title} view={view} folders={library.folders} onViewChange={setView} testId="board-manager"
		onNewFolder={() => setDialog({ kind: 'new-folder', name: '', folderId: selectedFolder?.id ?? null })}
		onDropBoard={(boardId, folderId) => { const board = library.boards.find((item) => item.id === boardId); if (board) void updateBoard(board, { folderId }) }}
		onLeaveLocal={mode !== 'portal' && authRequired ? () => { void closeEditorSession().then(() => setIsEditor(false)).catch((cause) => setError(message(cause))) } : undefined}
		actions={<>
					{selectedFolder && <DropdownMenu.Root><DropdownMenu.Trigger className="xp-icon-button" aria-label="Opciones de carpeta"><Icon name="more" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu" align="end">
						<DropdownMenu.Item className="xp-menu-item" onSelect={() => setDialog({ kind: 'rename-folder', id: selectedFolder.id, name: selectedFolder.name, folderId: selectedFolder.parentId })}>Renombrar carpeta</DropdownMenu.Item>
						<DropdownMenu.Item className="xp-menu-item" onSelect={() => setDialog({ kind: 'new-folder', name: '', folderId: selectedFolder.id })}>Nueva subcarpeta</DropdownMenu.Item>
					</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
					<button className="xp-icon-button board-new" aria-label="Nuevo canvas" title="Nuevo canvas" disabled={busy} onClick={() => void createBoard()}><Icon name="edit" /></button>
		</>}>
			{error && <p className="xp-error board-error" role="alert">{error}</p>}
			<div className="board-grid" aria-busy={loading}>
				{boards.map((board) => <article className="board-card" key={board.id} data-board-id={board.id} draggable={!board.trashedAt} onDragStart={(event) => event.dataTransfer.setData('application/x-xp-board', board.id)}>
					<button className="board-card-open" disabled={Boolean(board.trashedAt)} onClick={() => navigate(`/board/${board.id}`)} aria-label={`Abrir ${board.name}`}>
						<div className="board-card-preview">{board.thumbnailAt ? <img src={`/api/boards/${board.id}/thumbnail?v=${board.thumbnailAt}`} loading="lazy" decoding="async" alt="" draggable={false} /> : <Icon name="boards" size={44} />}</div>
						<div className="board-card-caption"><strong>{board.name}</strong><time dateTime={new Date(board.updatedAt).toISOString()}>{dateFormat.format(board.updatedAt)}</time></div>
					</button>
					{board.favorite && <span className="board-card-favorite" aria-label="Favorito"><Icon name="star" size={16} /></span>}
					<DropdownMenu.Root><DropdownMenu.Trigger className="xp-icon-button board-card-menu" aria-label={`Opciones de ${board.name}`}><Icon name="more" size={20} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu" align="end">
						{board.trashedAt ? <DropdownMenu.Item className="xp-menu-item" onSelect={() => void updateBoard(board, { trashed: false })}>Restaurar</DropdownMenu.Item> : <>
							{mode === 'portal' && <DropdownMenu.Item className="xp-menu-item" onSelect={() => setSharing(board)}>Compartir con alumnos</DropdownMenu.Item>}
							<DropdownMenu.Item className="xp-menu-item" onSelect={() => setDialog({ kind: 'rename-board', id: board.id, name: board.name, folderId: board.folderId })}>Renombrar</DropdownMenu.Item>
							<DropdownMenu.Item className="xp-menu-item" disabled={busy} onSelect={() => void copyBoard(board)}>Duplicar canvas</DropdownMenu.Item>
							<DropdownMenu.Item className="xp-menu-item" onSelect={() => setDialog({ kind: 'move-board', id: board.id, name: board.name, folderId: board.folderId })}>Mover a carpeta</DropdownMenu.Item>
							<DropdownMenu.Item className="xp-menu-item" onSelect={() => void updateBoard(board, { favorite: !board.favorite })}>{board.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</DropdownMenu.Item>
							<DropdownMenu.Separator className="xp-menu-separator" /><DropdownMenu.Item className="xp-menu-item xp-menu-item--danger" onSelect={() => void updateBoard(board, { trashed: true })}>Mover a la papelera</DropdownMenu.Item>
						</>}
					</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
				</article>)}
			</div>
			{!boards.length && <p className="board-empty">{loading ? 'Cargando…' : view === 'trash' ? 'La papelera está vacía.' : selectedFolder ? 'No hay canvases en esta carpeta.' : 'No hay canvases aquí.'}</p>}
		{sharing && <BoardAccessDialog board={sharing} onClose={() => setSharing(null)} />}
		{dialog && <Modal title={dialog.kind === 'new-folder' ? 'Nueva carpeta' : dialog.kind === 'move-board' ? 'Mover a carpeta' : 'Renombrar'} onClose={() => { if (!busy) setDialog(null) }}><form className="xp-form" onSubmit={submitDialog}>
			{dialog.kind === 'move-board' ? <label>Carpeta de destino<select value={dialog.folderId ?? ''} onChange={(event) => setDialog({ ...dialog, folderId: event.target.value || null })}><option value="">Sin carpeta</option>{library.folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder, library.folders)}</option>)}</select></label>
				: <label>Nombre<input value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value })} maxLength={120} autoFocus onFocus={(event) => event.target.select()} /></label>}
			{error && <p role="alert" className="xp-error">{error}</p>}
			<div className="xp-dialog-actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button><button className="xp-primary" disabled={busy || (dialog.kind !== 'move-board' && !dialog.name.trim())}>{dialog.kind === 'move-board' ? 'Mover' : 'Guardar'}</button></div>
		</form></Modal>}
	</LibraryShell>
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.' }
function folderPath(folder: BoardFolder, folders: BoardFolder[]) {
	const names = [folder.name], visited = new Set([folder.id])
	let parent = folders.find((candidate) => candidate.id === folder.parentId)
	while (parent && !visited.has(parent.id)) {
		visited.add(parent.id); names.unshift(parent.name)
		parent = folders.find((candidate) => candidate.id === parent?.parentId)
	}
	return names.join(' / ')
}
