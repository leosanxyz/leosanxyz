import { useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import { useConnectedStudents } from './studentPresence'
import type { PortalUser } from '../../shared/portal'
import { Icon } from '../components/Icon'

type DrawState = { activeId: string | null; running: boolean; finished: boolean }

export function ConnectedStudents({ editor, user, expanded, instant, allowedUserIds, permissionPending, onPermission, draw, onDraw }: { editor: Editor | null; user?: PortalUser | null; expanded: boolean; instant: boolean; allowedUserIds: string[]; permissionPending: boolean; onPermission: (userId: string, allowed: boolean) => void; draw: DrawState; onDraw: () => void }) {
	const students = useConnectedStudents(editor, user)
	const panel = useRef<HTMLDivElement>(null)
	const isTeacher = user?.role === 'teacher'
	useEffect(() => {
		if (!expanded) return
		const body = panel.current?.querySelector<HTMLElement>('.connected-students__body')
		const row = body?.querySelector('[data-draw-active="true"]')
		if (!body || !row) return
		const bounds = body.getBoundingClientRect(), target = row.getBoundingClientRect()
		if (target.top < bounds.top) body.scrollTop += target.top - bounds.top
		else if (target.bottom > bounds.bottom) body.scrollTop += target.bottom - bounds.bottom
	}, [draw.activeId, expanded])

	return (
		<aside className="connected-students" data-expanded={expanded} data-instant={instant} aria-label="Alumnos conectados">
			<div id="connected-students-list" className="connected-students__panel" ref={panel} inert={!expanded} aria-hidden={!expanded}>
				<div className="connected-students__heading">
					<h2 className="connected-students__title">Alumnos conectados</h2>
					{isTeacher && <button type="button" className="connected-students__dice" aria-label="Sortear alumno" title="Sortear alumno" disabled={!students.length || draw.running || permissionPending} onClick={onDraw}><Icon name="dice" size={23} /></button>}
				</div>
				<div className="connected-students__body">
					{students.length ? <ul>{students.map((student) => {
						const userId = student.userId.slice(5), allowed = allowedUserIds.includes(userId)
						const label = allowed ? 'Retirar permiso' : 'Permitir responder'
						return (
						<li key={student.userId} data-user-id={userId} data-hand-raised={student.handRaised} data-control={allowed} data-draw-active={draw.activeId === userId} data-draw-selected={draw.finished && draw.activeId === userId}>
							<span className="connected-students__avatar" aria-hidden="true">{student.userName.trim().slice(0, 1).toLocaleUpperCase('es')}</span>
							<span className="connected-students__name">{student.userName}</span>
							<div className="connected-students__actions">
							{student.handRaised && <span className="connected-students__raised-hand" role="img" aria-label="Mano levantada" title="Mano levantada"><span className="hand-raise-emoji" aria-hidden="true">🖐️</span></span>}
							{isTeacher ? <button type="button" className="connected-students__permission" aria-label={label} title={label} aria-pressed={allowed} disabled={permissionPending} onClick={() => onPermission(userId, !allowed)}><Icon name="cursor" size={20} /></button> : allowed && <span className="connected-students__control" role="img" aria-label="Tiene control" title="Tiene control"><Icon name="cursor" size={20} /></span>}
							</div>
						</li>
					)})}</ul> : <p>Todavía no hay alumnos conectados.</p>}
				</div>
				<span className="connected-students__draw-status" role="status">{draw.running ? 'Sorteando…' : ''}</span>
			</div>
		</aside>
	)
}

export function ConnectedStudentsToggle({ editor, user, expanded, onToggle }: { editor: Editor | null; user?: PortalUser | null; expanded: boolean; onToggle: (instant: boolean) => void }) {
	const count = useConnectedStudents(editor, user).length
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
