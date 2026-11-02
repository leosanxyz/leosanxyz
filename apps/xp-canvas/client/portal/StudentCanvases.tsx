import { useEffect, useState } from 'react'
import type { Roster } from '../../shared/portal'
import { BoardPreview, useRevealOrder } from '../boards/BoardPreview'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { BoardCardsSkeleton, revealDelay, useReveal } from '../components/Skeleton'
import { navigate } from '../navigation'
import { AgentList, ago } from './AgentList'
import { portalRequest } from './api'

/** Teacher view of one student: their personal canvases and the agents they connected. */
export default function StudentCanvases({ studentId }: { studentId: string }) {
	const { library } = useBoardLibrary()
	const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState('')
	useEffect(() => {
		const load = () => { if (!document.hidden) void portalRequest<Roster>('roster').then(setRoster).catch(() => setError('No pude cargar los canvases.')) }
		load()
		// Agents keep drawing during class; the list follows without reloading.
		const interval = window.setInterval(load, 20_000)
		return () => clearInterval(interval)
	}, [])
	const student = roster?.students.find((candidate) => candidate.id === studentId)
	const boards = roster?.canvases.filter((board) => board.ownerId === studentId) ?? []
	const reveal = useReveal(Boolean(roster))
	const thumbnails = useRevealOrder()
	return <LibraryShell title={student?.name ?? 'Alumno'} view="students" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/alumnos')} testId="student-canvases">
		{error && <p role="alert" className="xp-error board-error">{error}</p>}
		{roster && !student && <p className="board-empty">Este alumno no existe.</p>}
		<div className="board-grid board-grid--student" aria-busy={!roster} data-reveal={reveal}>
			{boards.map((board, index) => <article className="board-card" key={board.id} data-board-id={board.id} style={revealDelay(reveal, index)}>
				<button className="board-card-open" onClick={() => navigate(`/board/${board.id}`)} aria-label={`Abrir ${board.name}`}>
					<BoardPreview board={board} index={index} order={thumbnails} />
					<div className="board-card-caption"><strong>{board.name}</strong><time dateTime={new Date(board.updatedAt).toISOString()}>{ago(board.updatedAt)}</time></div>
				</button>
			</article>)}
			{!roster && !error && <BoardCardsSkeleton />}
		</div>
		{roster && student && !boards.length && <p className="board-empty">{student.name} todavía no tiene canvases propios.</p>}
		{student && <section className="student-agents" aria-label="Agentes conectados"><h2>Agentes conectados</h2><AgentList studentId={student.id} /></section>}
	</LibraryShell>
}
