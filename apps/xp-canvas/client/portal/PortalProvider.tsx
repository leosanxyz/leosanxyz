import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { PortalSession } from '../../shared/portal'
import { portalRequest } from './api'
import '../components/ui.css'
import './portal.css'

interface PortalContextValue extends PortalSession { refresh: () => Promise<void>; logout: () => Promise<void> }
const Context = createContext<PortalContextValue | null>(null)
export function usePortal() {
	const value = useContext(Context)
	if (!value) throw new Error('PortalProvider is required')
	return value
}

export function PortalProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<PortalSession | null>(null)
	const [error, setError] = useState('')
	const refresh = useCallback(async () => {
		const result = await portalRequest<PortalSession>('session')
		setSession(result); setError('')
	}, [])
	const logout = useCallback(async () => { await portalRequest('logout', 'POST'); await refresh() }, [refresh])
	useEffect(() => { void refresh().catch(() => setError('No pude conectar con el servidor.')) }, [refresh])
	useEffect(() => {
		if (session?.mode !== 'portal') return
		const check = () => { if (!document.hidden) void refresh().catch(() => {}) }
		const interval = window.setInterval(check, 30_000)
		document.addEventListener('visibilitychange', check)
		window.addEventListener('xp-session-changed', check)
		return () => { clearInterval(interval); document.removeEventListener('visibilitychange', check); window.removeEventListener('xp-session-changed', check) }
	}, [session?.mode, refresh])
	if (!session) return <main className="portal-entry"><div className="portal-entry-card"><h1>XP Canvas</h1><p role={error ? 'alert' : 'status'}>{error || 'Comprobando tu sesión…'}</p>{error && <button className="xp-primary" onClick={() => { setError(''); void refresh().catch(() => setError('No pude conectar con el servidor.')) }}>Reintentar</button>}</div></main>
	return <Context.Provider value={{ ...session, refresh, logout }}>
		{session.mode === 'portal' && (!session.user || session.user.mustChangePassword) ? <Login key={session.user?.id ?? 'login'} /> : children}
	</Context.Provider>
}

function Login() {
	const { user, refresh, logout } = usePortal()
	const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
	const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
	async function submit(event: FormEvent) {
		event.preventDefault(); if (busy) return
		if (user && password !== confirm) { setError('Las contraseñas no coinciden.'); return }
		setBusy(true); setError('')
		try {
			await portalRequest(user ? 'password' : 'login', 'POST', user ? { password } : { username, password })
			setPassword(''); setConfirm(''); await refresh()
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude iniciar sesión.') }
		finally { setBusy(false) }
	}
	return <main className="portal-entry"><section className="portal-entry-card">
		<h1>{user ? 'Elige tu contraseña' : 'Entra a tus clases'}</h1>
		<form className="xp-form" onSubmit={submit}>
			{!user && <label>Matrícula<input name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={32} required autoFocus /></label>}
			<label>{user ? 'Nueva contraseña' : 'Contraseña'}<input name="password" type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={user ? 'new-password' : 'current-password'} minLength={user ? 10 : undefined} maxLength={128} required autoFocus={Boolean(user)} /></label>
			{user && <label>Repite la contraseña<input name="confirm" type={visible ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required /></label>}
			<label className="portal-check"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Mostrar contraseña</label>
			{error && <p role="alert" className="xp-error">{error}</p>}
			<button className="xp-primary" disabled={busy}>{busy ? 'Un momento…' : user ? 'Guardar y continuar' : 'Entrar'}</button>
		</form>
		{user && <button className="portal-link" disabled={busy} onClick={() => { void logout().catch(() => setError('No pude cerrar la sesión.')) }}>Cerrar sesión</button>}
	</section></main>
}
