import { createUserId, useValue, type Editor } from 'tldraw'
import { collectConnectedStudents } from './studentPresence'
import { Icon } from '../components/Icon'

export function ConnectedStudents({ editor, expanded, instant, allowedUserIds, permissionPending, onPermission }: { editor: Editor | null; expanded: boolean; instant: boolean; allowedUserIds: string[]; permissionPending: boolean; onPermission: (userId: string, allowed: boolean) => void }) {
	const students = useValue('connected students', () => collectConnectedStudents(
		editor?.store.query.records('instance_presence').get() ?? []
	), [editor])

	return (
		<aside className="connected-students" data-expanded={expanded} data-instant={instant} aria-label="Alumnos conectados">
			<div id="connected-students-list" className="connected-students__panel" inert={!expanded} aria-hidden={!expanded}>
				<div className="connected-students__heading">
					<h2 className="connected-students__title">Alumnos conectados</h2>
				</div>
				<div className="connected-students__body">
					{students.length ? <ul>{students.map((student) => {
						const userId = student.userId.slice(5), allowed = allowedUserIds.includes(userId)
						const label = allowed ? 'Retirar permiso' : 'Permitir responder'
						return (
						<li key={student.userId} data-hand-raised={student.handRaised}>
							<span className="connected-students__avatar" aria-hidden="true">{student.userName.trim().slice(0, 1).toLocaleUpperCase('es')}</span>
							<span className="connected-students__name">{student.userName}</span>
							<div className="connected-students__actions">
							{student.handRaised && <span className="connected-students__raised-hand" role="img" aria-label="Mano levantada" title="Mano levantada"><span className="hand-raise-emoji" aria-hidden="true">🖐️</span></span>}
							<button type="button" className="connected-students__permission" aria-label={label} title={label} aria-pressed={allowed} disabled={permissionPending} onClick={() => onPermission(userId, !allowed)}><Icon name="cursor" size={20} /></button>
							</div>
						</li>
					)})}</ul> : <p>Todavía no hay alumnos conectados.</p>}
				</div>
			</div>
		</aside>
	)
}

export function ConnectedStudentsToggle({ editor, expanded, onToggle }: { editor: Editor | null; expanded: boolean; onToggle: (instant: boolean) => void }) {
	const count = useValue('connected student count', () => new Set(
		(editor?.getCollaborators() ?? []).filter((peer) => peer.userId !== createUserId('teacher')).map((peer) => peer.userId)
	).size, [editor])
	const label = expanded ? 'Colapsar alumnos conectados' : 'Mostrar alumnos conectados'
	return <button
		type="button"
		className="connected-students__toggle"
		aria-label={label}
		aria-expanded={expanded}
		aria-controls="connected-students-list"
		title={label}
		onClick={(event) => onToggle(event.detail === 0)}
	>
		<span className="connected-students__count" aria-live="polite">{count}</span>
		<Icon name="users" size={22} />
	</button>
}
