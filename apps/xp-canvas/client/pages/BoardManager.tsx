import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { DropdownMenu } from 'radix-ui'
import { type Board, type BoardFolder, type BoardLibrary, folderDescendants } from '../../shared/boards'
import { closeEditorSession, getEditorSession } from '../access'
import { boardRequest } from '../boards/api'
import { BOARD_DRAG, type FolderAction, LibraryShell } from '../boards/LibraryShell'
import { useBoardView } from '../boards/useBoardView'
import { EditorCodeDialog } from '../components/EditorCodeDialog'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { navigate } from '../navigation'
import '../boards/boards.css'
import { usePortal } from '../portal/PortalProvider'
import { BoardAccessDialog } from '../portal/BoardAccessDialog'

type Notice = { text: string; undo: () => Promise<void>; key: number }
type DialogState = { kind: 'new-folder' | 'rename-board' | 'move-board' | 'move-folder' | 'delete-folder'; id?: string; name: string; folderId: string | null }
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
	const cancelRef = useRef<HTMLButtonElement>(null)
	const [query, setQuery] = useState('')
	const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
	const [notice, setNotice] = useState<Notice | null>(null)

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

	useEffect(() => {
		if (!notice) return
		const timer = window.setTimeout(() => setNotice(null), 6000)
		return () => clearTimeout(timer)
	}, [notice])

	const selectedFolder = library.folders.find((folder) => folder.id === view)
	const search = searchKey(query)
	const title = search ? `Resultados para «${query.trim()}»` : selectedFolder ? <>
		{folderAncestors(selectedFolder, library.folders).map((folder) => <Fragment key={folder.id}>
			<button className="board-crumb" onClick={() => changeView(folder.id)}>{folder.name}</button><span className="board-crumb-separator" aria-hidden="true">/</span>
		</Fragment>)}{selectedFolder.name}
	</> : ({ all: 'Todos los canvases', recent: 'Recientes', favorites: 'Favoritos', trash: 'Papelera' }[view] ?? 'Todos los canvases')
	const boards = library.boards.filter((board) => {
		if (view === 'trash') return Boolean(board.trashedAt) && (!search || searchKey(board.name).includes(search))
		if (board.trashedAt) return false
		// A search looks through every canvas, not just the open folder.
		if (search) return searchKey(board.name).includes(search)
		if (view === 'favorites') return board.favorite
		if (selectedFolder) return board.folderId === selectedFolder.id
		return true
	}).sort((a, b) => b.updatedAt - a.updatedAt)

	function changeView(next: string) { setQuery(''); setView(next) }
	function place(folderId: string | null) {
		const folder = library.folders.find((item) => item.id === folderId)
		return folder ? `«${folder.name}»` : 'Todos los canvases'
	}
	/** Saves a change and, when it has an inverse, offers to undo it for a few seconds. */
	async function patch(path: string, data: object, undo?: { text: string; data: object }): Promise<boolean> {
		try {
			await boardRequest(path, 'PATCH', data); await load()
			if (undo) setNotice({ text: undo.text, undo: async () => { await patch(path, undo.data) }, key: Date.now() })
			return true
		} catch (cause) { setError(message(cause)); return false }
	}
	function moveBoard(board: Board, folderId: string | null) {
		return patch(`boards/${board.id}`, { folderId }, { text: `«${board.name}» se movió a ${place(folderId)}.`, data: { folderId: board.folderId } })
	}
	function moveFolder(folder: BoardFolder, parentId: string | null) {
		if (parentId && folderDescendants(library.folders, folder.id).has(parentId)) return Promise.resolve(false)
		return patch(`folders/${folder.id}`, { parentId }, { text: `«${folder.name}» se movió a ${place(parentId)}.`, data: { parentId: folder.parentId } })
	}
	async function renameFolder(id: string, name: string | null) {
		setRenamingFolder(null)
		if (name !== null) { setError(''); await patch(`folders/${id}`, { name }) }
	}
	async function undoNotice() {
		if (!notice) return
		setNotice(null); setError('')
		await notice.undo()
	}
	function folderActions(folder: BoardFolder): FolderAction[] {
		return [
			{ label: 'Renombrar carpeta', onSelect: () => setRenamingFolder(folder.id) },
			{ label: 'Nueva subcarpeta', onSelect: () => setDialog({ kind: 'new-folder', name: '', folderId: folder.id }) },
			{ label: 'Mover carpeta', onSelect: () => setDialog({ kind: 'move-folder', id: folder.id, name: folder.name, folderId: folder.parentId }) },
			{ label: 'Eliminar carpeta', danger: true, onSelect: () => { setError(''); setDialog({ kind: 'delete-folder', id: folder.id, name: folder.name, folderId: folder.parentId }) } },
		]
	}
	function updateBoard(board: Board, data: Partial<Board> | { trashed: boolean }) {
		return patch(`boards/${board.id}`, data)
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
			if (view === 'favorites' || search) changeView(copy.folderId ?? 'all')
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
				changeView(folder.id)
			} else if (dialog.kind === 'delete-folder') {
				await boardRequest(`folders/${dialog.id}`, 'DELETE')
				changeView(dialog.folderId ?? 'all')
			} else if (dialog.kind === 'move-folder') {
				const folder = library.folders.find((item) => item.id === dialog.id)
				if (folder && !(await moveFolder(folder, dialog.folderId))) return
			} else if (dialog.kind === 'move-board') {
				const board = library.boards.find((item) => item.id === dialog.id)
				if (board && !(await moveBoard(board, dialog.folderId))) return
			} else await boardRequest(`boards/${dialog.id}`, 'PATCH', { name: dialog.name })
			await load(); setDialog(null)
		} catch (cause) { setError(message(cause)) }
		finally { setBusy(false) }
	}

	if (isEditor === null) return <div className="board-loading">Abriendo canvases…</div>
	if (!isEditor) return <div className="board-welcome"><Icon name="boards" size={46} /><h1>Tus canvases</h1><button className="xp-primary" onClick={() => setUnlock(true)}>Editar</button><a href="/board/principal" onClick={(event) => { event.preventDefault(); navigate('/board/principal') }}>Ver Principal</a>
		{error && <p className="xp-error" role="alert">{error}</p>}
		{unlock && <EditorCodeDialog onClose={() => setUnlock(false)} onUnlock={() => { setUnlock(false); setIsEditor(true) }} />}
	</div>

	return <LibraryShell title={title} view={view} folders={library.folders} onViewChange={changeView} testId="board-manager"
		onNewFolder={() => setDialog({ kind: 'new-folder', name: '', folderId: selectedFolder?.id ?? null })}
		onDropBoard={(boardId, folderId) => { const board = library.boards.find((item) => item.id === boardId); if (board && board.folderId !== folderId) void moveBoard(board, folderId) }}
		onDropFolder={(folderId, parentId) => { const folder = library.folders.find((item) => item.id === folderId); if (folder && folder.parentId !== parentId) void moveFolder(folder, parentId) }}
		folderActions={folderActions} renamingFolder={renamingFolder} onRenameStart={setRenamingFolder} onRenameEnd={(id, name) => void renameFolder(id, name)}
		onLeaveLocal={mode !== 'portal' && authRequired ? () => { void closeEditorSession().then(() => setIsEditor(false)).catch((cause) => setError(message(cause))) } : undefined}
		actions={<>
					<label className="board-search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }} placeholder="Buscar" aria-label="Buscar canvases" /></label>
					{selectedFolder && !search && <DropdownMenu.Root><DropdownMenu.Trigger className="xp-icon-button" aria-label="Opciones de carpeta"><Icon name="more" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu" align="end" onCloseAutoFocus={(event) => { if (renamingFolder) event.preventDefault() }}>
						{folderActions(selectedFolder).map((action) => <Fragment key={action.label}>
							{action.danger && <DropdownMenu.Separator className="xp-menu-separator" />}
							<DropdownMenu.Item className={action.danger ? 'xp-menu-item xp-menu-item--danger' : 'xp-menu-item'} onSelect={action.onSelect}>{action.label}</DropdownMenu.Item>
						</Fragment>)}
					</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
					<button className="xp-icon-button board-new" aria-label="Nuevo canvas" title="Nuevo canvas" disabled={busy} onClick={() => void createBoard()}><Icon name="plus" /></button>
		</>}>
			{error && <p className="xp-error board-error" role="alert">{error}</p>}
			<div className="board-grid" aria-busy={loading}>
				{boards.map((board) => <article className="board-card" key={board.id} data-board-id={board.id} draggable={!board.trashedAt} onDragStart={(event) => event.dataTransfer.setData(BOARD_DRAG, board.id)}>
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
							<DropdownMenu.Separator className="xp-menu-separator" /><DropdownMenu.Item className="xp-menu-item xp-menu-item--danger" onSelect={() => void patch(`boards/${board.id}`, { trashed: true }, { text: `«${board.name}» está en la papelera.`, data: { trashed: false } })}>Mover a la papelera</DropdownMenu.Item>
						</>}
					</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
				</article>)}
			</div>
			{!boards.length && <p className="board-empty">{loading ? 'Cargando…' : search ? 'Ningún canvas coincide con la búsqueda.' : view === 'trash' ? 'La papelera está vacía.' : selectedFolder ? 'No hay canvases en esta carpeta.' : 'No hay canvases aquí.'}</p>}
		{notice && <div className="board-toast" role="status" key={notice.key}><span>{notice.text}</span><button onClick={() => void undoNotice()}>Deshacer</button></div>}
		{sharing && <BoardAccessDialog board={sharing} onClose={() => setSharing(null)} />}
		{dialog && <Modal title={dialog.kind === 'new-folder' ? 'Nueva carpeta' : dialog.kind === 'move-board' ? 'Mover a carpeta' : dialog.kind === 'move-folder' ? 'Mover carpeta' : dialog.kind === 'delete-folder' ? 'Eliminar carpeta' : 'Renombrar'} initialFocusRef={dialog.kind === 'delete-folder' ? cancelRef : undefined} onClose={() => { if (!busy) setDialog(null) }}><form className="xp-form" onSubmit={submitDialog}>
			{dialog.kind === 'move-board' || dialog.kind === 'move-folder' ? <label>Carpeta de destino<select value={dialog.folderId ?? ''} onChange={(event) => setDialog({ ...dialog, folderId: event.target.value || null })}><option value="">Sin carpeta</option>{moveTargets(dialog, library.folders).map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder, library.folders)}</option>)}</select></label>
				: dialog.kind === 'delete-folder' ? <DeleteFolderMessage folder={dialog} library={library} />
				: <label>Nombre<input value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value })} maxLength={120} autoFocus onFocus={(event) => event.target.select()} /></label>}
			{error && <p role="alert" className="xp-error">{error}</p>}
			<div className="xp-dialog-actions"><button ref={cancelRef} type="button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button><button className={dialog.kind === 'delete-folder' ? 'xp-danger' : 'xp-primary'} disabled={busy || (!dialog.kind.startsWith('move') && !dialog.name.trim())}>{dialog.kind.startsWith('move') ? 'Mover' : dialog.kind === 'delete-folder' ? busy ? 'Eliminando…' : 'Eliminar' : 'Guardar'}</button></div>
		</form></Modal>}
	</LibraryShell>
}

function DeleteFolderMessage({ folder, library }: { folder: DialogState; library: BoardLibrary }) {
	const removed = folderDescendants(library.folders, folder.id!)
	const boards = library.boards.filter((board) => !board.trashedAt && board.folderId && removed.has(board.folderId)).length
	const parent = library.folders.find((item) => item.id === folder.folderId)
	return <div className="board-delete-message">
		<p>¿Eliminar <strong>{folder.name}</strong>{removed.size > 1 ? ` y ${removed.size - 1 === 1 ? 'su subcarpeta' : `sus ${removed.size - 1} subcarpetas`}` : ''}?</p>
		<p>{boards ? `${boards === 1 ? 'Su canvas irá' : `Sus ${boards} canvases irán`} a la papelera. Si ${boards === 1 ? 'lo' : 'los'} restauras, ${boards === 1 ? 'volverá' : 'volverán'} a ${parent ? `«${parent.name}»` : 'Todos los canvases'}.` : 'La carpeta está vacía.'}</p>
	</div>
}

/** A folder cannot move into itself or anything nested inside it. */
function moveTargets(dialog: DialogState, folders: BoardFolder[]) {
	if (dialog.kind !== 'move-folder') return folders
	const blocked = folderDescendants(folders, dialog.id!)
	return folders.filter((folder) => !blocked.has(folder.id))
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.' }
/** Case- and accent-insensitive, so «fraccion» finds «Fracción». */
function searchKey(text: string) { return text.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es') }
function folderAncestors(folder: BoardFolder, folders: BoardFolder[]) {
	const ancestors: BoardFolder[] = [], visited = new Set([folder.id])
	let parent = folders.find((candidate) => candidate.id === folder.parentId)
	while (parent && !visited.has(parent.id)) {
		visited.add(parent.id); ancestors.unshift(parent)
		parent = folders.find((candidate) => candidate.id === parent?.parentId)
	}
	return ancestors
}
function folderPath(folder: BoardFolder, folders: BoardFolder[]) {
	return [...folderAncestors(folder, folders), folder].map((item) => item.name).join(' / ')
}
