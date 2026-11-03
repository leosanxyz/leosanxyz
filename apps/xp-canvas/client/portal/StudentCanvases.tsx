import { useEffect, useState } from 'react'
import type { Roster } from '../../shared/portal'
import { BoardPreview, useRevealOrder } from '../boards/BoardPreview'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { SAMPLE_BOARDS, Skeleton } from '../components/Skeleton'
import { navigate } from '../navigation'
import { AgentList, ago } from './AgentList'
import { portalRequest } from './api'
import { boardRequest } from '../boards/api'
import type { Board } from '../../shared/boards'

/** Teacher view of one student: their personal canvases and the agents they connected. */
export default function StudentCanvases({ studentId }: { studentId: string }) {
	const { library } = useBoardLibrary()
	const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState(''), [restoring, setRestoring] = useState<string | null>(null)
	const reload = () => portalRequest<Roster>('roster').then(setRoster)
	useEffect(() => {
		const load = () => { if (!document.hidden) void reload().catch(() => setError('No pude cargar los canvases.')) }
		load()
		// Agents keep drawing during class; the list follows without reloading.
		const interval = window.setInterval(load, 20_000)
		return () => clearInterval(interval)
	}, [])
	const student = roster?.students.find((candidate) => candidate.id === studentId)
	// The student's trash stays visible here: Leo grades these canvases and can bring one back.
	const boards = (roster?.canvases.filter((board) => board.ownerId === studentId) ?? []).sort((a, b) => Number(Boolean(a.trashedAt)) - Number(Boolean(b.trashedAt)))
	async function restore(board: Board) {
		setRestoring(board.id); setError('')
		try { await boardRequest(`boards/${board.id}`, 'PATCH', { trashed: false }); await reload() }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude restaurar el canvas.') }
		finally { setRestoring(null) }
	}
	const thumbnails = useRevealOrder()
	return <LibraryShell title={student?.name ?? 'Alumno'} view="students" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/alumnos')} testId="student-canvases">
		{error && <p role="alert" className="xp-error board-error">{error}</p>}
		{roster && !student && <p className="board-empty">Este alumno no existe.</p>}
		{(roster || !error) && <Skeleton data={roster && boards} sample={SAMPLE_BOARDS} label="Cargando canvases">{(boards) => <div className="board-grid board-grid--student">
			{boards.map((board, index) => <article className="board-card" key={board.id} data-board-id={board.id} data-trashed={board.trashedAt ? 'true' : undefined}>
				<button className="board-card-open" onClick={() => navigate(`/board/${board.id}`)} aria-label={`Abrir ${board.name}`}>
					<BoardPreview board={board} index={index} order={thumbnails} />
					<div className="board-card-caption"><strong>{board.name}</strong><time dateTime={new Date(board.updatedAt).toISOString()}>{board.trashedAt ? `En la papelera · ${ago(board.trashedAt)}` : ago(board.updatedAt)}</time></div>
				</button>
				{board.trashedAt && <button className="portal-button board-card-restore" disabled={restoring === board.id} onClick={() => void restore(board)}>Restaurar</button>}
			</article>)}
		</div>}</Skeleton>}
		{roster && student && !boards.length && <p className="board-empty">{student.name} todavía no tiene canvases propios.</p>}
		{student && <section className="student-agents" aria-label="Agentes conectados"><h2>Agentes conectados</h2><AgentList studentId={student.id} /></section>}
	</LibraryShell>
}
