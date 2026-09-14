import {
	DurableObjectSqliteSyncWrapper,
	type RoomSnapshot,
	type SessionStateSnapshot,
	SQLiteSyncStorage,
	TLSocketRoom,
} from '@tldraw/sync-core'
import {
	createTLSchema,
	// defaultBindingSchemas,
	defaultShapeSchemas,
	TLRecord,
} from '@tldraw/tlschema'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { type CanvasEnv, editorAuthRequired, INTERNAL_ROLE_HEADER } from './access'
import { resourceShapeProps } from '../shared/resourceShape'

// add custom shapes and bindings here if needed:
const schema = createTLSchema({
	shapes: { ...defaultShapeSchemas, resource: { props: resourceShapeProps } },
	// bindings: { ...defaultBindingSchemas },
})

interface SocketAttachment {
	sessionId: string
	isReadonly: boolean
	authExpiresAt: number | null
	snapshot: SessionStateSnapshot | null
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
				onSessionSnapshot: (sessionId, snapshot) => {
					const ws = this.sessionIdToWs.get(sessionId)
					const attachment = ws && getAttachment(ws)
					if (ws && attachment) ws.serializeAttachment({ ...attachment, snapshot })
				},
			})

			// Resume any sessions that survived hibernation
			for (const ws of this.ctx.getWebSockets()) {
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

	// Binding-only RPC methods. The public Worker exposes neither method over HTTP.
	getDocumentSnapshot(): RoomSnapshot {
		return this.getOrCreateRoom().getCurrentSnapshot()
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
		const sessionId = request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')
		// Initialize before accepting this socket so it is not mistaken for a half-restored
		// hibernated connection while getOrCreateRoom scans ctx.getWebSockets().
		const room = this.getOrCreateRoom()

		// Create the websocket pair for the client
		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		// Use hibernation API instead of serverWebSocket.accept()
		this.ctx.acceptWebSocket(serverWebSocket)

		// Store sessionId in attachment immediately so we can identify this socket
		// after hibernation, before the connect handshake completes.
		const isReadonly = request.headers.get(INTERNAL_ROLE_HEADER) !== 'editor'
		const authExpiresAt = Number(request.headers.get('x-xp-canvas-auth-exp')) || null
		const attachment: SocketAttachment = { sessionId, isReadonly, authExpiresAt, snapshot: null }
		serverWebSocket.serializeAttachment(attachment)

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
		return (
			editorAuthRequired(this.env) &&
			!attachment.isReadonly &&
			(attachment.authExpiresAt === null ||
				attachment.authExpiresAt <= Math.floor(Date.now() / 1000))
		)
	}
}
