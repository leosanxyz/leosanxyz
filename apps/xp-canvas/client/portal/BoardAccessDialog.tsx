import { useEffect, useState, type FormEvent } from 'react'
import type { BoardGrant, Roster } from '../../shared/portal'
import type { Board } from '../../shared/boards'
import { Modal } from '../components/Modal'
import { portalRequest } from './api'

export function BoardAccessDialog({ board, onClose }: { board: Board; onClose: () => void }) {
	const [roster, setRoster] = useState<Roster | null>(null), [grants, setGrants] = useState<BoardGrant[]>([])
	const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [search, setSearch] = useState('')
	useEffect(() => {
		let active = true
		void Promise.all([portalRequest<Roster>('roster'), portalRequest<{ grants: BoardGrant[] }>(`boards/${board.id}/access`)]).then(([roster, access]) => { if (active) { setRoster(roster); setGrants(access.grants) } }).catch(() => { if (active) setError('No pude cargar los accesos. Cierra y vuelve a intentar.') })
		return () => { active = false }
	}, [board.id])
	function toggle(kind: BoardGrant['kind'], subjectId: string) {
		setGrants((current) => current.some((grant) => grant.kind === kind && grant.subjectId === subjectId) ? current.filter((grant) => grant.kind !== kind || grant.subjectId !== subjectId) : [...current, { kind, subjectId }])
	}
	async function submit(event: FormEvent) {
		event.preventDefault(); if (busy || !roster) return
		setBusy(true); setError(''); setNotice('')
		try { await portalRequest(`boards/${board.id}/access`, 'PUT', { grants }); setNotice('Accesos guardados.') }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude guardar los accesos.') }
		finally { setBusy(false) }
	}
	return <Modal title={`Compartir ${board.name}`} onClose={() => { if (!busy) onClose() }}><form className="xp-form" onSubmit={submit}>
		<p className="portal-hint">Solo las personas seleccionadas y los integrantes de estos grupos podrán abrir el enlace. Tendrán acceso de lectura.</p>
		{!roster && !error && <p role="status">Cargando accesos…</p>}
		{roster && <><fieldset className="portal-options" disabled={busy}><legend>Grupos</legend>{roster.groups.length ? roster.groups.map((group) => <label className="portal-check" key={group.id}><input type="checkbox" checked={grants.some((g) => g.kind === 'group' && g.subjectId === group.id)} onChange={() => toggle('group', group.id)} />{group.name}</label>) : <p className="portal-hint">Crea tus grupos desde Alumnos.</p>}</fieldset>
			<label>Buscar alumno<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
			<fieldset className="portal-options portal-options--students" disabled={busy}><legend>Alumnos individuales</legend>{roster.students.filter((student) => !student.disabled && `${student.name} ${student.username}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((student) => <label className="portal-check" key={student.id}><input type="checkbox" checked={grants.some((g) => g.kind === 'user' && g.subjectId === student.id)} onChange={() => toggle('user', student.id)} /><span>{student.name}<small>{student.username}</small></span></label>)}</fieldset></>}
		{error && <p className="xp-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
		<div className="xp-dialog-actions"><button type="button" onClick={() => { void navigator.clipboard.writeText(`${location.origin}/board/${board.id}`).then(() => setNotice('Enlace copiado. Guarda los accesos antes de enviarlo.')).catch(() => setError('No pude copiar el enlace. Puedes copiar la dirección del navegador.')) }}>Copiar enlace</button><button className="xp-primary" disabled={busy || !roster}>{busy ? 'Guardando…' : 'Guardar accesos'}</button></div>
	</form></Modal>
}
