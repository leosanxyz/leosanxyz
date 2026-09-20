import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Roster, Student } from '../../shared/portal'
import { Modal } from '../components/Modal'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { navigate } from '../navigation'
import { portalRequest } from './api'

export default function Students() {
	const { library } = useBoardLibrary()
	const [roster, setRoster] = useState<Roster | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
	const [search, setSearch] = useState(''), [groupFilter, setGroupFilter] = useState('')
	const [dialog, setDialog] = useState<'group' | 'import' | Student | null>(null), [busy, setBusy] = useState(false)
	const [text, setText] = useState(''), [selectedGroup, setSelectedGroup] = useState(''), [resetConfirm, setResetConfirm] = useState(false)
	const load = useCallback(async () => { setRoster(await portalRequest<Roster>('roster')) }, [])
	useEffect(() => { void load().catch(() => setError('No pude cargar la lista de alumnos.')) }, [load])
	function open(next: typeof dialog) {
		setError(''); setNotice(''); setResetConfirm(false)
		setText(typeof next === 'object' && next ? next.name : '')
		setSelectedGroup(typeof next === 'object' && next ? next.groupId ?? '' : groupFilter)
		setDialog(next)
	}
	async function submit(event: FormEvent) {
		event.preventDefault(); if (!dialog || busy) return
		setBusy(true); setError('')
		try {
			if (dialog === 'group') await portalRequest('groups', 'POST', { name: text })
			else if (dialog === 'import') {
				const students = text.split('\n').filter((line) => line.trim()).map((line) => {
					const parts = line.split(';')
					if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) throw new Error('Usa una línea por alumno: matrícula; nombre completo.')
					return { username: parts[0].trim(), name: parts[1].trim() }
				})
				const result = await portalRequest<{ created: number }>('students', 'POST', { students, groupId: selectedGroup || null })
				setNotice(`${result.created} alumnos añadidos. Su contraseña inicial es su matrícula.`)
			} else await portalRequest(`students/${dialog.id}`, 'PATCH', { name: text, groupId: selectedGroup || null })
			await load(); setDialog(null)
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude guardar los cambios.') }
		finally { setBusy(false) }
	}
	async function accountAction(student: Student, reset: boolean) {
		if (busy) return
		setBusy(true); setError('')
		try {
			await portalRequest(`students/${student.id}${reset ? '/reset' : ''}`, reset ? 'POST' : 'PATCH', reset ? undefined : { disabled: !student.disabled })
			await load(); setDialog(null)
			setNotice(reset ? `Contraseña de ${student.name} restablecida a su matrícula. Sus sesiones anteriores se cerraron.` : `Cuenta de ${student.name} ${student.disabled ? 'habilitada' : 'deshabilitada'}.`)
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude actualizar la cuenta.') }
		finally { setBusy(false) }
	}
	const students = roster?.students.filter((student) => (!groupFilter || student.groupId === groupFilter) && `${student.name} ${student.username}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? []
	return <LibraryShell title="Alumnos" view="students" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/')} testId="students-admin"
		actions={<><button className="portal-button" onClick={() => open('group')}>Nuevo grupo</button><button className="xp-primary" disabled={!roster} onClick={() => open('import')}>Añadir alumnos</button></>}>
		<div className="portal-admin-tools"><label>Buscar <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o matrícula" /></label><label>Grupo <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">Todos los grupos</option>{roster?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
		{!dialog && error && <p role="alert" className="xp-error">{error} <button className="portal-link" onClick={() => { void load().then(() => setError('')).catch(() => setError('No pude cargar la lista de alumnos.')) }}>Reintentar</button></p>}
		{notice && <p role="status">{notice}</p>}
		<section className="portal-students" aria-label="Lista de alumnos" aria-busy={!roster}>
			{students.map((student) => <article className="portal-student" data-disabled={student.disabled} key={student.id}><div><strong>{student.name}</strong><p>{student.username} · {roster?.groups.find((group) => group.id === student.groupId)?.name ?? 'Sin grupo'}</p><p>{student.disabled ? 'Cuenta deshabilitada' : student.mustChangePassword ? 'Pendiente de cambiar contraseña' : 'Cuenta activa'}</p></div><button className="portal-button" onClick={() => open(student)} aria-label={`Administrar ${student.name}`}>Administrar</button></article>)}
		</section>
		{!students.length && <p>{roster ? 'No hay alumnos en esta lista.' : 'Cargando alumnos…'}</p>}
		{dialog && <Modal title={dialog === 'group' ? 'Nuevo grupo' : dialog === 'import' ? 'Añadir alumnos' : `Cuenta de ${dialog.name}`} onClose={() => { if (!busy) setDialog(null) }}><form className="xp-form" onSubmit={submit}>
			{dialog === 'import' ? <><p className="portal-hint">Una línea por alumno, hasta 100 a la vez. Separa matrícula y nombre con punto y coma. Las cuentas existentes no se sobrescriben.</p><label>Lista de alumnos<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={'A01234567; Ana López\nA01234568; Luis Pérez'} required autoFocus /></label></> : <label>Nombre<input value={text} onChange={(event) => setText(event.target.value)} maxLength={120} required autoFocus /></label>}
			{dialog !== 'group' && <label>Grupo<select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}><option value="">Sin grupo</option>{roster?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
			{error && <p className="xp-error" role="alert">{error}</p>}
			<div className="xp-dialog-actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button><button className="xp-primary" disabled={busy || !text.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
			{typeof dialog === 'object' && <><hr /><p className="portal-hint">Restablecer vuelve a colocar la matrícula como contraseña y cierra las sesiones abiertas. El alumno tendrá que elegir una nueva.</p><div className="xp-dialog-actions"><button type="button" disabled={busy} onClick={() => { if (resetConfirm) void accountAction(dialog, true); else setResetConfirm(true) }}>{resetConfirm ? 'Confirmar restablecimiento' : 'Restablecer contraseña'}</button></div><button className="portal-link" type="button" disabled={busy} onClick={() => void accountAction(dialog, false)}>{dialog.disabled ? 'Habilitar cuenta' : 'Deshabilitar cuenta'}</button></>}
		</form></Modal>}
	</LibraryShell>
}
