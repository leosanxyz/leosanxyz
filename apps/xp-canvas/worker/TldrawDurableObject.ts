import {
	DurableObjectSqliteSyncWrapper,
	type RoomSnapshot,
	type SessionStateSnapshot,
	SQLiteSyncStorage,
	TLSocketRoom,
	TLSyncErrorCloseEventCode,
	TLSyncErrorCloseEventReason,
} from '@tldraw/sync-core'
import { TLRecord } from '@tldraw/tlschema'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { type CanvasEnv, editorAuthRequired, INTERNAL_ROLE_HEADER } from './access'
import { canvasSchema as schema } from './boardSnapshot'
import { canReadBoard, portalEnabled, PORTAL_IDENTITY_HEADER, sessionByHash } from './portalAuth'
import { bindPresence, documentReferencesAsset } from './portalPresence'
import { readBoard } from './boards'
import type { PortalUser } from '../shared/portal'
import type { InteractionState, QuestionCommand, QuestionFeedback } from '../shared/questionShape'

interface SocketAttachment {
	sessionId: string
	isReadonly: boolean
	authExpiresAt: number | null
	snapshot: SessionStateSnapshot | null
	portal?: { tokenHash: string; roomId: string; user: PortalUser }
	revoked?: boolean
}

function getAttachment(ws: WebSocket): SocketAttachment | null {
	const attachment = ws.deserializeAttachment() as SocketAttachment | null
	return attachment?.sessionId ? attachment : null
}

// Each whiteboard room is hosted in a Durable Object with WebSocket Hibernation.
// https://developers.cloudflare.com/durable-objects/
//
// There's only ever one durable object instance per room. Room state is
// persisted automatically to SQLite via ctx.storage. When all clients are
// idle, the DO hibernates (freeing memory) while WebSocket connections
// stay alive at the Cloudflare layer.
export class TldrawDurableObject extends DurableObject<CanvasEnv> {
	private room: TLSocketRoom<TLRecord, void> | null = null
	/** Map sessionId → ws so onSessionSnapshot can serialize to the right socket. */
	private readonly sessionIdToWs = new Map<string, WebSocket>()

	constructor(ctx: DurableObjectState, env: CanvasEnv) {
		super(ctx, env)
		// Respond to ping messages at the platform level without waking the DO.
		// The TLSyncClient sends {"type":"ping"} every 5s; without this, each
		// ping would wake the DO from hibernation.
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
		)
	}

	private getOrCreateRoom(): TLSocketRoom<TLRecord, void> {
		if (!this.room) {
			const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
			const storage = new SQLiteSyncStorage<TLRecord>({ sql })

			this.room = new TLSocketRoom<TLRecord, void>({
				schema,
				storage,
				// Disable idle timeout since Cloudflare handles keep-alive via auto-response.
				// Without this, sessions would be pruned after 20s of no "real" messages
				// even though the client is still connected and being auto-ponged.
				clientTimeout: Infinity,
				onAfterReceiveMessage: (event) => {
					const { sessionId } = event
					const ws = this.sessionIdToWs.get(sessionId)
					const identity = ws && getAttachment(ws)?.portal
					if (identity) {
						// tldraw 5.4 exposes the assembled message at runtime but marks it
						// @internal in its declarations. Keep this adapter covered by smoke.
						if (!('message' in event)) throw new Error('Unsupported tldraw presence hook')
						bindPresence(event.message, identity.user)
					}
				},
				onSessionSnapshot: (sessionId, snapshot) => {
					const ws = this.sessionIdToWs.get(sessionId)
					const attachment = ws && getAttachment(ws)
					if (ws && attachment) ws.serializeAttachment({ ...attachment, snapshot })
				},
			})

			// Resume any sessions that survived hibernation
			for (const ws of this.ctx.getWebSockets()) {
				if (ws.readyState !== WebSocket.OPEN) continue
				const attachment = getAttachment(ws)
				if (!attachment?.snapshot) {
					ws.close(1012, 'Reconnect required')
					continue
				}
				if (this.hasExpired(attachment)) {
					ws.close(4003, 'Editor session expired')
					continue
				}

				this.sessionIdToWs.set(attachment.sessionId, ws)
				this.room.handleSocketResume({
					sessionId: attachment.sessionId,
					socket: ws,
					snapshot: attachment.isReadonly
						? { ...attachment.snapshot, isReadonly: true }
						: attachment.snapshot,
				})
			}
		}
		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) }).get(
		'/api/connect/:roomId',
		(request) => this.handleConnect(request)
	)

	// The Worker only exposes document export to authenticated editors.
	getDocumentSnapshot(): RoomSnapshot {
		return this.getOrCreateRoom().getCurrentSnapshot()
	}

	private questionPeers() {
		return this.ctx.getWebSockets().flatMap((ws) => {
			const attachment = getAttachment(ws)
			return ws.readyState === WebSocket.OPEN && attachment?.portal && !this.hasExpired(attachment)
				? [{ ws, attachment, user: attachment.portal.user }] : []
		})
	}

	private questionPermissions(user: PortalUser): InteractionState {
		this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS question_permissions (user_id TEXT PRIMARY KEY)')
		const ids = this.ctx.storage.sql.exec<{ user_id: string }>('SELECT user_id FROM question_permissions').toArray().map((row) => row.user_id)
		return { type: 'question-permissions', allowedUserIds: user.role === 'teacher' ? ids : ids.filter((id) => id === user.id) }
	}

	private broadcastQuestionPermissions() {
		const room = this.getOrCreateRoom()
		for (const { attachment, user } of this.questionPeers()) {
			room.sendCustomMessage(attachment.sessionId, this.questionPermissions(user))
		}
	}

	async questionInteraction(roomId: string, tokenHash: string, command: QuestionCommand | null) {
		const denied = (status: number, message: string) => ({ status, body: { error: message } })
		if (!portalEnabled(this.env)) return denied(403, 'Interacción no disponible.')
		const session = await sessionByHash(tokenHash, this.env)
		const board = await readBoard(this.env, roomId)
		if (!session || !board || board.trashedAt || !await canReadBoard(session, roomId, this.env)) return denied(403, 'No tienes acceso a este canvas.')
		const room = this.getOrCreateRoom(), user = session.user
		if (!command) return { status: 200, body: this.questionPermissions(user) }
		if (command.action === 'permission') {
			if (user.role !== 'teacher') return denied(403, 'Solo el maestro puede dar permiso.')
			const peers = this.questionPeers().filter((peer) => peer.user.id === command.userId && peer.user.role === 'student')
			if (command.allowed && !peers.length) return denied(409, 'El alumno ya no está conectado.')
			this.questionPermissions(user)
			if (command.allowed) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO question_permissions (user_id) VALUES (?)', command.userId)
			else this.ctx.storage.sql.exec('DELETE FROM question_permissions WHERE user_id = ?', command.userId)
		} else {
			if (user.role !== 'student' || !this.questionPermissions(user).allowedUserIds.includes(user.id)) return denied(403, 'Espera a que el maestro te dé permiso para responder.')
			// The record check and write are synchronous, so concurrent answers and
			// teacher edits cannot pass against the same stale question state.
			let correct = false
			const result = room.storage.transaction((store) => {
				const shape = store.get(command.shapeId)
				if (!shape || shape.typeName !== 'shape' || shape.type !== 'question') return 'Esta pregunta ya no existe.'
				if (shape.props.revision !== command.revision) return 'La pregunta cambió. Vuelve a elegir una respuesta.'
				if (shape.props.answered.includes(command.answer)) return 'Esa respuesta ya fue elegida.'
				correct = command.answer === shape.props.correct
				store.set(shape.id, { ...shape, props: { ...shape.props, answered: [...shape.props.answered, command.answer] } })
				return null
			}).result
			if (result) return denied(409, result)
			const feedback: QuestionFeedback = { type: 'question-result', id: crypto.randomUUID(), shapeId: command.shapeId, revision: command.revision, answer: command.answer, correct }
			for (const { attachment } of this.questionPeers()) room.sendCustomMessage(attachment.sessionId, feedback)
		}
		this.broadcastQuestionPermissions()
		return { status: 200, body: this.questionPermissions(user) }
	}

	referencesAsset(uploadId: string): boolean {
		if (!/^[a-zA-Z0-9_-]{12,64}$/.test(uploadId)) return false
		return documentReferencesAsset(this.getOrCreateRoom().getCurrentSnapshot().documents, uploadId)
	}

	async revalidatePortalSessions() {
		if (!portalEnabled(this.env)) return
		for (const ws of this.ctx.getWebSockets()) {
			if (ws.readyState !== WebSocket.OPEN) continue
			const attachment = getAttachment(ws), identity = attachment?.portal
			let allowed = false
			if (identity) {
				try {
					const session = await sessionByHash(identity.tokenHash, this.env)
					const board = await readBoard(this.env, identity.roomId)
					allowed = Boolean(board && !board.trashedAt && await canReadBoard(session, identity.roomId, this.env))
				} catch { /* Fail closed if authorization is unavailable. */ }
			}
			if (!allowed) {
				this.revokeSocket(ws, attachment)
			}
		}
		if (this.ctx.getWebSockets().some((ws) => ws.readyState === WebSocket.OPEN)) await this.ctx.storage.setAlarm(Date.now() + 60_000)
	}

	override async alarm() { await this.revalidatePortalSessions() }

	private revokeSocket(ws: WebSocket, attachment: SocketAttachment | null) {
		if (attachment) ws.serializeAttachment({ ...attachment, revoked: true, snapshot: null })
		// Close with tldraw's fatal code before its normal-close cleanup can send 1000.
		ws.close(TLSyncErrorCloseEventCode, TLSyncErrorCloseEventReason.FORBIDDEN)
		if (attachment) {
			this.room?.closeSession(attachment.sessionId, TLSyncErrorCloseEventReason.FORBIDDEN)
			this.sessionIdToWs.delete(attachment.sessionId)
		}
	}

	initializeCopy(snapshot: RoomSnapshot): void {
		// A copy may initialize a fresh room, never replace an existing document.
		const tables = this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'").toArray()
		if (this.room || tables.length) throw new Error('El canvas de destino ya existe.')
		this.getOrCreateRoom().loadSnapshot(snapshot)
	}

	// Entry point for all requests to the Durable Object
	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	// Handle new WebSocket connection requests
	async handleConnect(request: IRequest) {
		const sessionId = portalEnabled(this.env) ? crypto.randomUUID() : request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')
		let portal: SocketAttachment['portal']
		if (portalEnabled(this.env)) {
			const tokenHash = request.headers.get(PORTAL_IDENTITY_HEADER) ?? ''
			const session = await sessionByHash(tokenHash, this.env)
			const board = await readBoard(this.env, request.params.roomId)
			if (!session || !board || board.trashedAt || !await canReadBoard(session, board.id, this.env)) return error(403, 'Access denied')
			portal = { tokenHash, roomId: board.id, user: session.user }
		}
		// Initialize before accepting this socket so it is not mistaken for a half-restored
		// hibernated connection while getOrCreateRoom scans ctx.getWebSockets().
		const room = this.getOrCreateRoom()

		// Create the websocket pair for the client
		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		// Use hibernation API instead of serverWebSocket.accept()
		this.ctx.acceptWebSocket(serverWebSocket)

		// Store sessionId in attachment immediately so we can identify this socket
		// after hibernation, before the connect handshake completes.
		const isReadonly = portal ? portal.user.role !== 'teacher' : request.headers.get(INTERNAL_ROLE_HEADER) !== 'editor'
		const authExpiresAt = Number(request.headers.get('x-xp-canvas-auth-exp')) || null
		const attachment: SocketAttachment = { sessionId, isReadonly, authExpiresAt, snapshot: null, ...(portal ? { portal } : {}) }
		serverWebSocket.serializeAttachment(attachment)
		this.sessionIdToWs.set(sessionId, serverWebSocket)
		if (portal && !await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 60_000)

		// Connect to the room. The first webSocketMessage from the client will
		// complete the handshake and trigger debounced snapshot storage.
		room.handleSocketConnect({
			sessionId,
			socket: serverWebSocket,
			isReadonly,
		})

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	// --- WebSocket Hibernation API handlers ---

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const attachment = getAttachment(ws)
		if (!attachment) return
		if (this.hasExpired(attachment)) {
			if (portalEnabled(this.env)) { this.revokeSocket(ws, attachment); return }
			this.sessionIdToWs.delete(attachment.sessionId)
			this.room?.handleSocketClose(attachment.sessionId)
			ws.close(4003, 'Editor session expired')
			return
		}

		this.sessionIdToWs.set(attachment.sessionId, ws)
		this.getOrCreateRoom().handleSocketMessage(attachment.sessionId, message)
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const attachment = getAttachment(ws)
		if (!attachment) return

		this.sessionIdToWs.delete(attachment.sessionId)
		if (attachment.revoked) { this.room?.[method](attachment.sessionId); return }

		const room = this.getOrCreateRoom()

		// If the DO was hibernating, this session was never re-added to the room
		// (ctx.getWebSockets() doesn't include the disconnecting socket). Resume it
		// briefly so the room can broadcast presence removal to other clients.
		if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionId)) {
			room.handleSocketResume({
				sessionId: attachment.sessionId,
				socket: ws,
				snapshot: attachment.snapshot,
			})
		}

		room[method](attachment.sessionId)
	}

	private hasExpired(attachment: SocketAttachment) {
		if (attachment.revoked) return true
		if (portalEnabled(this.env)) return !attachment.portal || !attachment.authExpiresAt || attachment.authExpiresAt <= Math.floor(Date.now() / 1000)
		return (
			editorAuthRequired(this.env) &&
			!attachment.isReadonly &&
			(attachment.authExpiresAt === null ||
				attachment.authExpiresAt <= Math.floor(Date.now() / 1000))
		)
	}
}
