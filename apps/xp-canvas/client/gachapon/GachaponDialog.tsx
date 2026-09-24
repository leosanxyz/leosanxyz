import { useEffect, useState } from 'react'
import { createShapeId, type Editor } from 'tldraw'
import { REWARD_SKIN_SETS } from '../../shared/pass'
import type { GachaponShape } from '../../shared/gachaponShape'
import type { BoardGrant, Roster } from '../../shared/portal'
import { skins } from '../portal/pass/catalog'
import { portalRequest } from '../portal/api'
import { Modal } from '../components/Modal'

export function GachaponDialog({ editor, roomId, shape, onClose }: { editor: Editor; roomId: string; shape: GachaponShape | null; onClose: () => void }) {
	const [cost, setCost] = useState(String(shape?.props.cost ?? 0))
	const validCost = cost.trim() !== '' && Number.isInteger(Number(cost)) && Number(cost) >= 0 && Number(cost) <= 1_000_000
	const [pool, setPool] = useState<string[]>(shape?.props.pool ?? [...REWARD_SKIN_SETS[0]])
	const [allowed, setAllowed] = useState(shape?.props.allowedUserIds ?? [])
	const [roster, setRoster] = useState<Roster | null>(null), [grants, setGrants] = useState<BoardGrant[]>([])
	const [group, setGroup] = useState(''), [error, setError] = useState('')
	useEffect(() => {
		let live = true
		void Promise.all([portalRequest<Roster>('roster'), portalRequest<{ grants: BoardGrant[] }>(`boards/${roomId}/access`)]).then(([r, g]) => { if (live) { setRoster(r); setGrants(g.grants) } }).catch(() => { if (live) setError('No pude cargar los alumnos. Cierra y vuelve a intentar.') })
		return () => { live = false }
	}, [roomId])
	const students = roster?.students.filter((student) => !student.disabled && grants.some((grant) => grant.kind === 'user' ? grant.subjectId === student.id : grant.subjectId === student.groupId)) ?? []
	const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((value) => value !== id) : [...list, id]
	function save() {
		if (!validCost || !pool.length || !roster) return
		const props = { cost: Number(cost), pool, allowedUserIds: allowed.filter((id) => students.some((s) => s.id === id)) }
		editor.markHistoryStoppingPoint('gachapon')
		if (shape) {
			if (!editor.getShape(shape.id)) { onClose(); return }
			editor.updateShape<GachaponShape>({ id: shape.id, type: 'gachapon', props })
		} else {
			const id = createShapeId(), center = editor.getViewportPageBounds().center
			editor.createShape<GachaponShape>({ id, type: 'gachapon', x: center.x - 150, y: center.y - 220, props })
			editor.setCurrentTool('select').select(id)
		}
		onClose()
	}
	return <Modal title={shape ? 'Configurar gachapon' : 'Nuevo gachapon'} onClose={onClose}><form className="xp-form gachapon-form" onSubmit={(event) => { event.preventDefault(); save() }}>
		<fieldset><legend>Tarjetas disponibles</legend>{REWARD_SKIN_SETS.map((set, index) => <div className="gachapon-set" key={index}><h3>Set {index + 1}</h3><div className="gachapon-pool">{set.map((id) => { const skin = skins.find((s) => s.id === id)!; return <label key={id} data-selected={pool.includes(id)}><img style={{ objectPosition: skin.position }} src={skin.image} alt="" /><span><input type="checkbox" checked={pool.includes(id)} onChange={() => setPool(toggle(pool, id))} />{skin.name}</span></label> })}</div></div>)}</fieldset>
		<fieldset><legend>Alumnos habilitados</legend>{roster ? <><label>Grupo<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Todos los grupos de este canvas</option>{roster.groups.filter((g) => students.some((s) => s.groupId === g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label><div className="gachapon-students">{students.filter((s) => !group || s.groupId === group).map((student) => <label key={student.id}><input type="checkbox" checked={allowed.includes(student.id)} onChange={() => setAllowed(toggle(allowed, student.id))} />{student.name}{shape?.props.usedUserIds.includes(student.id) && <small>Ya participó</small>}</label>)}</div>{!students.length && <p>Comparte este canvas con un grupo o alumno para poder seleccionarlo.</p>}</> : <p role="status">{error || 'Cargando alumnos…'}</p>}</fieldset>
		<label>Costo por tirada<input type="number" min={0} max={1000000} step={1} required value={cost} onChange={(event) => setCost(event.target.value)} /><small>0 puntos = gratis</small></label>
		<p>Una tirada por alumno. Necesitan permiso de interacción y el cursor activo. Todas las tarjetas elegidas tienen la misma probabilidad; pueden repetirse.</p>
		<div className="xp-dialog-actions">{shape && <button type="button" onClick={() => { editor.markHistoryStoppingPoint('reset gachapon'); editor.updateShape<GachaponShape>({ id: shape.id, type: 'gachapon', props: { revision: crypto.randomUUID(), usedUserIds: [] } }); onClose() }}>Reiniciar tiradas</button>}<button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={!pool.length || !roster || !validCost}>{shape ? 'Guardar' : 'Añadir al canvas'}</button></div>
	</form></Modal>
}
