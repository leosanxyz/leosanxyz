import { useCallback, useEffect, useState } from 'react'
import type { AgentGrant } from '../../shared/portal'
import { portalRequest } from './api'

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const timeFormat = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })
export function ago(time: number) {
	const minutes = Math.round((time - Date.now()) / 60_000)
	if (minutes > -60) return timeFormat.format(Math.min(minutes, 0), 'minute')
	if (minutes > -24 * 60) return timeFormat.format(Math.round(minutes / 60), 'hour')
	return dateFormat.format(time)
}

/** Agents connected with OAuth. `studentId` is the teacher's view of one student; without it, the student's own list. */
export function AgentList({ studentId }: { studentId?: string }) {
	const path = studentId ? `students/${studentId}/agents` : 'agents'
	const [agents, setAgents] = useState<AgentGrant[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
	const load = useCallback(async () => { setAgents((await portalRequest<{ agents: AgentGrant[] }>(path)).agents) }, [path])
	useEffect(() => { void load().catch(() => setError('No pude cargar los agentes.')) }, [load])
	async function revoke(grant?: AgentGrant) {
		if (busy) return
		setBusy(true); setError('')
		try {
			if (studentId) setAgents((await portalRequest<{ agents: AgentGrant[] }>(path, 'DELETE')).agents)
			else { await portalRequest(`agents/${grant!.id}`, 'DELETE'); await load() }
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude desconectar al agente.') }
		finally { setBusy(false) }
	}
	if (!agents) return error ? <p role="alert" className="xp-error">{error}</p> : <p><span className="xp-skeleton skeleton-line" /></p>
	return <div className="agent-list" data-testid="agent-list">
		{agents.length ? <ul>{agents.map((agent) => <li key={agent.id}>
			<div><strong>{agent.client}</strong><p>Conectado el {dateFormat.format(agent.createdAt)}{agent.lastUsedAt ? ` · usado ${ago(agent.lastUsedAt)}` : ''}</p></div>
			{!studentId && <button className="portal-button" disabled={busy} onClick={() => void revoke(agent)}>Desconectar</button>}
		</li>)}</ul> : <p className="portal-hint">{studentId ? 'No tiene agentes conectados.' : 'Todavía no conectas ningún agente. La primera vez que tu Codex use XP Canvas, te pedirá permiso aquí.'}</p>}
		{studentId && agents.length > 0 && <button className="portal-button" disabled={busy} onClick={() => void revoke()}>Revocar {agents.length === 1 ? 'su agente' : `sus ${agents.length} agentes`}</button>}
		{error && <p role="alert" className="xp-error">{error}</p>}
	</div>
}
