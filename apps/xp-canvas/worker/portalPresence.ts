import type { PortalUser } from '../shared/portal'
import { createUserId } from '@tldraw/tlschema'

/** Called after tldraw reassembles chunked messages, before it applies presence. */
export function bindPresence(message: unknown, user: Pick<PortalUser, 'id' | 'name'>) {
	if (!message || typeof message !== 'object') return
	const event = message as { type?: string; presence?: unknown }
	if (event.type !== 'push' || !Array.isArray(event.presence)) return
	const [operation, value] = event.presence
	if (!value || typeof value !== 'object' || Array.isArray(value)) return
	if (operation === 'put') { value.userId = createUserId(user.id); value.userName = user.name }
	else if (operation === 'patch') { value.userId = ['put', createUserId(user.id)]; value.userName = ['put', user.name] }
}

export function documentReferencesAsset(value: unknown, uploadId: string): boolean {
	if (typeof value === 'string') {
		try { return new URL(value, 'https://canvas.invalid').pathname === `/api/uploads/${uploadId}` } catch { return false }
	}
	if (Array.isArray(value)) return value.some((item) => documentReferencesAsset(item, uploadId))
	return Boolean(value && typeof value === 'object' && Object.values(value).some((item) => documentReferencesAsset(item, uploadId)))
}
