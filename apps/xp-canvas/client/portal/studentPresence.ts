import { useValue, type Editor } from 'tldraw'
import type { PortalUser } from '../../shared/portal'
import { createUserId, getDefaultUserPresence, TLINSTANCE_ID, type TLInstancePresence, type TLStore, type TLUser } from '@tldraw/tlschema'

export function getCanvasUserPresence(store: TLStore, user: TLUser) {
	const presence = getDefaultUserPresence(store, user)
	if (!presence) return null
	return { ...presence, meta: { ...presence.meta, handRaised: store.get(TLINSTANCE_ID)?.meta.handRaised === true } }
}

// Use every session: the most recently active tab may not be the one with a raised hand.
export function collectConnectedStudents(peers: Pick<TLInstancePresence, 'userId' | 'userName' | 'meta'>[]) {
	const students = new Map<string, { userId: string; userName: string; handRaised: boolean }>()
	for (const peer of peers) {
		if (peer.userId === createUserId('teacher')) continue
		const previous = students.get(peer.userId)
		students.set(peer.userId, {
			userId: peer.userId,
			userName: peer.userName,
			handRaised: previous?.handRaised === true || peer.meta.handRaised === true,
		})
	}
	return [...students.values()].sort((a, b) => a.userName.localeCompare(b.userName, 'es'))
}

export function useConnectedStudents(editor: Editor | null, user?: PortalUser | null) {
	return useValue('connected students including self', () => {
		const peers = editor?.store.query.records('instance_presence').get() ?? []
		return collectConnectedStudents(user?.role === 'student' && editor ? [...peers, {
			userId: createUserId(user.id), userName: user.name, meta: editor.getInstanceState().meta,
		}] : peers)
	}, [editor, user])
}
