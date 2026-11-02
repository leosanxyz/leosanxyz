import { useEffect, useState } from 'react'
import { XpLogo } from '../components/XpLogo'
import { navigate } from '../navigation'
import { usePortal } from './PortalProvider'

// OAuth consent: the student's agent (Codex) opens this page the first time it uses XP Canvas.
// The login screen and the welcome come first through PortalProvider and PassGate.
async function oauthRequest<T>(method: 'GET' | 'POST', params: Record<string, string>, approve?: boolean): Promise<T> {
	const response = method === 'GET'
		? await fetch(`/api/oauth/authorize?${new URLSearchParams(params)}`, { cache: 'no-store' })
		: await fetch('/api/oauth/authorize', { method, cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...params, approve }) })
	const result = await response.json() as T & { error?: string }
	if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.')
	return result
}

const PARAMS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']

export default function Authorize() {
	const { user } = usePortal()
	const [params] = useState(() => {
		const search = new URLSearchParams(location.search)
		return Object.fromEntries(PARAMS.flatMap((key) => search.has(key) ? [[key, search.get(key)!]] : []))
	})
	const [client, setClient] = useState<string | null>(null), [returnsTo, setReturnsTo] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false)
	useEffect(() => {
		oauthRequest<{ client: string; returnsTo?: string }>('GET', params)
			.then((result) => { setClient(result.client); setReturnsTo(result.returnsTo ?? '') }).catch((cause) => setError(cause instanceof Error ? cause.message : 'No pude revisar la solicitud.'))
	}, [params])
	async function answer(approve: boolean) {
		if (busy) return
		setBusy(true); setError('')
		try {
			const { redirect } = await oauthRequest<{ redirect: string }>('POST', params, approve)
			setDone(approve)
			location.assign(redirect)
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude completar la conexión.'); setBusy(false) }
	}
	return <main className="portal-entry"><XpLogo size={48} /><section className="portal-entry-card portal-authorize" data-testid="oauth-consent">
		{done ? <>
			<h1>Listo, {user?.name.split(' ')[0]}</h1>
			<p>Tu agente ya puede dibujar en tus canvases. Vuelve a Codex para seguir.</p>
		</> : <>
			<h1>Conectar tu agente</h1>
			{client === null && !error && <p><span className="xp-skeleton skeleton-line" /></p>}
			{client !== null && <>
				<p><strong>{client}</strong> quiere usar tu cuenta de XP Canvas, <strong>{user?.name}</strong>.</p>
				<ul className="portal-authorize-list">
					<li>Podrá ver y crear tus canvases personales, y leer y dibujar diagramas en ellos.</li>
					<li>No podrá cambiar tus clases, tu contraseña, tus puntos ni tu pase.</li>
					<li>Leo puede ver tus canvases. Puedes desconectar al agente cuando quieras desde Mi perfil.</li>
				</ul>
				{returnsTo && <p className="portal-hint">Al permitir, el acceso se enviará a <strong>{returnsTo}</strong>. Si no reconoces ese sitio, pulsa Cancelar.</p>}
			</>}
			{error && <p role="alert" className="xp-error">{error}</p>}
			<div className="xp-dialog-actions">
				{client !== null ? <>
					<button type="button" disabled={busy} onClick={() => void answer(false)}>Cancelar</button>
					<button className="xp-primary" disabled={busy} onClick={() => void answer(true)}>{busy ? 'Conectando…' : 'Permitir'}</button>
				</> : error && <button className="xp-primary" onClick={() => navigate('/')}>Ir a mis clases</button>}
			</div>
		</>}
	</section></main>
}
