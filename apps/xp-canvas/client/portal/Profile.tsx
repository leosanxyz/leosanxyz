import { useState, type FormEvent } from 'react'
import { Collapsible } from 'radix-ui'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { Icon } from '../components/Icon'
import { navigate } from '../navigation'
import { usePortal } from './PortalProvider'
import { portalRequest } from './api'
import { usePass } from './pass/PassGate'
import { ProfilePass } from './pass/ProfilePass'
import './profile.css'

export default function Profile({ initiallyEditing = false }: { initiallyEditing?: boolean }) {
	const { user } = usePortal()
	const { profile } = usePass()
	const { library } = useBoardLibrary()
	const account = <div className="profile-account">
				<div className="profile-identity"><h2>{user?.name}</h2><p aria-label={user?.role === 'student' ? 'Matrícula' : 'Usuario'}>{user?.username}</p></div>
				<Collapsible.Root className="profile-password">
					<Collapsible.Trigger className="profile-settings-row"><Icon name="lock" size={20} /><span>Cambiar contraseña</span><Icon name="chevron" size={17} /></Collapsible.Trigger>
					<Collapsible.Content className="profile-password-content"><ChangePassword /></Collapsible.Content>
				</Collapsible.Root>
				{profile && <button className="profile-settings-row profile-replay" onClick={() => navigate('/bienvenida')}><Icon name="recent" size={20} /><span>Repetir la bienvenida</span><Icon name="chevron" size={17} /></button>}
			</div>
	return <LibraryShell title="Mi perfil" view="profile" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/')} testId="portal-profile">
		{profile ? <ProfilePass profile={profile} account={account} initiallyEditing={initiallyEditing} /> : <div className="portal-profile portal-profile-grid" data-has-pass="false">{account}</div>}
	</LibraryShell>
}

function ChangePassword() {
	const { user, refresh } = usePortal()
	const [currentPassword, setCurrentPassword] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
	const [busy, setBusy] = useState(false), [visible, setVisible] = useState(false)
	const [error, setError] = useState(''), [message, setMessage] = useState('')
	async function submit(event: FormEvent) {
		event.preventDefault()
		if (busy) return
		setError(''); setMessage('')
		if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
		if (password === currentPassword) { setError('Elige una contraseña distinta de la actual.'); return }
		setBusy(true)
		try {
			await portalRequest('password', 'POST', { currentPassword, password })
			setCurrentPassword(''); setPassword(''); setConfirm('')
			setMessage('Contraseña actualizada. Tus otras sesiones se cerraron.')
			await refresh()
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude cambiar la contraseña.') }
		finally { setBusy(false) }
	}
	return <form className="xp-form" onSubmit={submit}>
			<input type="text" name="username" value={user?.username ?? ''} readOnly autoComplete="username" hidden />
			<label>Contraseña actual<input name="current-password" type={visible ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" maxLength={128} required disabled={busy} /></label>
			<label>Nueva contraseña<input name="new-password" type={visible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required disabled={busy} /></label>
			<label>Repite la contraseña<input name="confirm-password" type={visible ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required disabled={busy} /></label>
			<label className="portal-check"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />Mostrar contraseñas</label>
			{error && <p role="alert" className="xp-error">{error}</p>}
			{message && <p role="status">{message}</p>}
			<button className="xp-primary" disabled={busy}>{busy ? 'Guardando…' : 'Actualizar contraseña'}</button>
	</form>
}
