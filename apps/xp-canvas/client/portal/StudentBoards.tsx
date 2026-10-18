import { BoardPreview, useRevealOrder } from '../boards/BoardPreview'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { useBoardView } from '../boards/useBoardView'
import { BoardCardsSkeleton, revealDelay, useReveal } from '../components/Skeleton'
import { navigate } from '../navigation'

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

export function StudentBoards() {
	const { library, error, reload } = useBoardLibrary()
	const [view, setView] = useBoardView()
	const reveal = useReveal(Boolean(library))
	const thumbnails = useRevealOrder()
	const selectedFolder = library?.folders.find((folder) => folder.id === view)
	const activeView = selectedFolder?.id ?? (view === 'recent' ? 'recent' : 'all')
	const boards = (library?.boards ?? []).filter((board) => !selectedFolder || board.folderId === selectedFolder.id).sort((a, b) => b.updatedAt - a.updatedAt)
	return <LibraryShell title={selectedFolder?.name ?? (view === 'recent' ? 'Recientes' : 'Mis clases')} view={activeView} folders={library?.folders ?? []} onViewChange={setView} testId="student-boards">
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
		{library && !boards.length && <p className="board-empty">{selectedFolder ? 'No hay canvases en esta carpeta.' : 'Todavía no tienes clases compartidas.'}</p>}
	</LibraryShell>
}
