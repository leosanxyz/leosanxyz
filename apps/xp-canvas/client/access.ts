export async function getEditorSession() {
	const response = await fetch('/api/editor-session', { cache: 'no-store' })
	if (!response.ok) throw new Error('No se pudo comprobar la sesión')
	const data = (await response.json()) as { role?: string; authRequired?: boolean }
	return { isEditor: data.role === 'editor', authRequired: data.authRequired !== false }
}

export async function openEditorSession(code: string) {
	const response = await fetch('/api/editor-session', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code }),
	})
	return response.ok
}

export async function closeEditorSession() {
	const response = await fetch('/api/editor-session/logout', { method: 'POST' })
	if (!response.ok) throw new Error('No se pudo cerrar la sesión')
}

export function getViewerUrl() {
	return `${window.location.origin}${window.location.pathname}${window.location.search}`
}
