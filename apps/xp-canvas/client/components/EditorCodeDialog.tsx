import { useState, type FormEvent } from 'react'
import { openEditorSession } from '../access'
import { Modal } from './Modal'

export function EditorCodeDialog({ onClose, onUnlock }: { onClose: () => void; onUnlock: () => void }) {
	const [code, setCode] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	async function submit(event: FormEvent) {
		event.preventDefault()
		if (!code.trim() || busy) return
		setBusy(true); setError('')
		try {
			if (await openEditorSession(code.trim())) onUnlock()
			else setError('El código no es correcto.')
		} catch { setError('No pude comprobar el código. Revisa la conexión.') }
		finally { setBusy(false) }
	}
	return <Modal title="Entrar como editor" onClose={onClose}>
		<form onSubmit={submit} className="xp-form">
			<label>Código privado<input type="password" autoComplete="current-password" value={code} onChange={(event) => setCode(event.target.value)} autoFocus /></label>
			{error && <p role="alert" className="xp-error">{error}</p>}
			<div className="xp-dialog-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={busy || !code.trim()}>{busy ? 'Comprobando…' : 'Entrar'}</button></div>
		</form>
	</Modal>
}
