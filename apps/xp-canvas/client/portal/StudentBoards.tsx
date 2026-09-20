import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { useBoardView } from '../boards/useBoardView'
import { Icon } from '../components/Icon'
import { navigate } from '../navigation'

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

export function StudentBoards() {
	const { library, error, reload } = useBoardLibrary()
	const [view, setView] = useBoardView()
	const selectedFolder = library?.folders.find((folder) => folder.id === view)
	const activeView = selectedFolder?.id ?? (view === 'recent' ? 'recent' : 'all')
	const boards = (library?.boards ?? []).filter((board) => !selectedFolder || board.folderId === selectedFolder.id).sort((a, b) => b.updatedAt - a.updatedAt)
	return <LibraryShell title={selectedFolder?.name ?? (view === 'recent' ? 'Recientes' : 'Mis clases')} view={activeView} folders={library?.folders ?? []} onViewChange={setView} testId="student-boards">
		{error && <p role="alert" className="xp-error board-error">{error} <button className="portal-link" onClick={() => void reload()}>Reintentar</button></p>}
		<div className="board-grid board-grid--student" aria-busy={!library}>
			{boards.map((board) => <article className="board-card" key={board.id} data-board-id={board.id}>
				<button className="board-card-open" onClick={() => navigate(`/board/${board.id}`)} aria-label={`Abrir ${board.name}`}>
					<div className="board-card-preview">{board.thumbnailAt ? <img src={`/api/boards/${board.id}/thumbnail?v=${board.thumbnailAt}`} alt="" loading="lazy" decoding="async" draggable={false} /> : <Icon name="boards" size={44} />}</div>
					<div className="board-card-caption"><strong>{board.name}</strong><time dateTime={new Date(board.updatedAt).toISOString()}>{dateFormat.format(board.updatedAt)}</time></div>
				</button>
			</article>)}
		</div>
		{!library && !error && <p className="board-empty" role="status">Cargando…</p>}
		{library && !boards.length && <p className="board-empty">{selectedFolder ? 'No hay canvases en esta carpeta.' : 'Todavía no tienes clases compartidas.'}</p>}
	</LibraryShell>
}
