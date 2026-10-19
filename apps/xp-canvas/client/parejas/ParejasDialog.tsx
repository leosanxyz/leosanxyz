import { useEffect, useState } from 'react'
import { createShapeId, type Editor } from 'tldraw'
import { createUserId } from '@tldraw/tlschema'
import { PAREJAS_MAX, type Participant, type ParejasShape } from '../../shared/parejasShape'
import type { BoardGrant, Roster } from '../../shared/portal'
import { portalRequest } from '../portal/api'
import { Modal } from '../components/Modal'
import { SkeletonLines } from '../components/Skeleton'
import { PAREJAS_HEIGHT, PAREJAS_WIDTH } from './ParejasShapeUtil'

/** Quien no está en el roster entra con un nombre suelto; su id sale del nombre. */
const NAME_PREFIX = 'nombre:'
function looseNames(text: string): Participant[] {
	const names = new Map<string, Participant>()
	for (const line of text.split('\n')) {
		const name = line.trim().replace(/\s+/g, ' ').slice(0, 60), id = `${NAME_PREFIX}${name.toLocaleLowerCase('es')}`
		if (name && !names.has(id)) names.set(id, { id, name })
	}
	return [...names.values()]
}

export function ParejasDialog({ editor, roomId, shape, onClose }: { editor: Editor; roomId: string; shape: ParejasShape | null; onClose: () => void }) {
	const saved = shape?.props.participants ?? []
	const [title, setTitle] = useState(shape?.props.title ?? '')
	const [chosen, setChosen] = useState(saved.filter((p) => !p.id.startsWith(NAME_PREFIX)).map((p) => p.id))
	const [others, setOthers] = useState(saved.filter((p) => p.id.startsWith(NAME_PREFIX)).map((p) => p.name).join('\n'))
	const [roster, setRoster] = useState<Roster | null>(null), [grants, setGrants] = useState<BoardGrant[]>([])
	const [group, setGroup] = useState(''), [error, setError] = useState('')
	useEffect(() => {
		let live = true
		void Promise.all([portalRequest<Roster>('roster'), portalRequest<{ grants: BoardGrant[] }>(`boards/${roomId}/access`)]).then(([r, g]) => { if (live) { setRoster(r); setGrants(g.grants) } }).catch(() => { if (live) setError('No pude cargar los alumnos. Cierra y vuelve a intentar.') })
		return () => { live = false }
	}, [roomId])
	const students = roster?.students.filter((student) => !student.disabled && grants.some((grant) => grant.kind === 'user' ? grant.subjectId === student.id : grant.subjectId === student.groupId)) ?? []
	const visible = students.filter((s) => !group || s.groupId === group)
	const participants = [...students.filter((s) => chosen.includes(s.id)).map((s) => ({ id: s.id, name: s.name.trim().slice(0, 60) || s.username.slice(0, 60) })), ...looseNames(others)]
	const tooMany = participants.length > PAREJAS_MAX
	const toggle = (id: string) => setChosen((list) => list.includes(id) ? list.filter((value) => value !== id) : [...list, id])
	// Marca a los alumnos del grupo visible que tienen el canvas abierto ahora.
	const markConnected = () => {
		const present = new Set(editor.store.query.records('instance_presence').get().map((presence) => presence.userId))
		setChosen((list) => [...new Set([...list, ...visible.filter((s) => present.has(createUserId(s.id))).map((s) => s.id)])])
	}
	function save() {
		if (!roster || tooMany) return
		const ids = new Set(participants.map((p) => p.id))
		editor.markHistoryStoppingPoint('parejas')
		if (shape) {
			const latest = editor.getShape<ParejasShape>(shape.id)
			if (!latest) { onClose(); return }
			editor.updateShape<ParejasShape>({ id: shape.id, type: 'parejas', props: { title: title.trim(), participants, pairs: latest.props.pairs.filter((pair) => pair.every((id) => ids.has(id))) } })
		} else {
			const id = createShapeId(), center = editor.getViewportPageBounds().center
			editor.createShape<ParejasShape>({ id, type: 'parejas', x: center.x - PAREJAS_WIDTH / 2, y: center.y - PAREJAS_HEIGHT / 2, props: { title: title.trim(), participants } })
			editor.setCurrentTool('select').select(id)
		}
		onClose()
	}
	return <Modal title={shape ? 'Editar parejas' : 'Nuevas parejas'} onClose={onClose}><form className="xp-form parejas-form" onSubmit={(event) => { event.preventDefault(); save() }}>
		<label>Título<input maxLength={60} value={title} placeholder="Minecraft" onChange={(event) => setTitle(event.target.value)} /></label>
		<fieldset><legend>Participantes · {participants.length}</legend>{roster ? <>
			<label className="xp-reveal">Grupo<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Todos los grupos de este canvas</option>{roster.groups.filter((g) => students.some((s) => s.groupId === g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
			<button type="button" className="parejas-form__marcar" disabled={!visible.length} onClick={markConnected}>Marcar conectados</button>
			<div className="parejas-alumnos xp-reveal">{visible.map((student) => <label key={student.id}><input type="checkbox" checked={chosen.includes(student.id)} onChange={() => toggle(student.id)} />{student.name}{shape?.props.pairs.some((pair) => pair.includes(student.id)) && <small>Ya tiene pareja</small>}</label>)}</div>
			{!students.length && <p>Comparte este canvas con un grupo o alumno para poder seleccionarlo.</p>}
		</> : error ? <p role="alert">{error}</p> : <SkeletonLines />}</fieldset>
		<label>Otros nombres<textarea rows={3} value={others} placeholder={'Un nombre por línea\nLeo'} onChange={(event) => setOthers(event.target.value)} /></label>
		{tooMany && <p className="xp-error" role="alert">Caben hasta {PAREJAS_MAX} participantes por tómbola.</p>}
		<p>Sortea de dos en dos; si quedan tres, caen juntos. Usa una tómbola por grupo cuando quieras separar, por ejemplo Minecraft y Roblox.</p>
		<div className="xp-dialog-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={!roster || tooMany}>{shape ? 'Guardar' : 'Añadir al canvas'}</button></div>
	</form></Modal>
}
