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
import { savePointAward, type PointAward } from './points'
import { GACHAPON_DURATION, type GachaponResult } from '../shared/gachaponShape'
import type { RewardSkin } from '../shared/pass'
import { DRAW_DURATION, type StudentDraw } from '../shared/studentDraw'
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
	private gachaBusy = new Set<string>()
	private pointsFlush: Promise<void> | null = null
	private pointReceiptsImported = false
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
		return { type: 'question-permissions', allowedUserIds: user.role === 'teacher' ? ids : ids.filter((id) => id === user.id || this.questionPeers().some((peer) => peer.user.id === id)) }
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
		if (!command) { this.broadcastQuestionPermissions(); return { status: 200, body: this.questionPermissions(user) } }
		if (command.action === 'gachapon') return this.spinGachapon(roomId, user, command)
		if (command.action === 'draw') {
			if (user.role !== 'teacher') return denied(403, 'Solo el maestro puede sortear alumnos.')
			const peers = this.questionPeers().filter((peer) => peer.user.role === 'student')
			const students = [...new Map(peers.map((peer) => [peer.user.id, peer.user])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
			if (!students.length) return denied(409, 'Todavía no hay alumnos conectados.')
			// A timestamp survives hibernation and also prevents overlapping draws from other teacher tabs.
			this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS student_draw (id INTEGER PRIMARY KEY CHECK (id = 1), ends_at INTEGER)')
			const previous = this.ctx.storage.sql.exec<{ ends_at: number }>('SELECT ends_at FROM student_draw WHERE id = 1').toArray()[0]
			if (previous && previous.ends_at > Date.now()) return denied(409, 'Espera a que termine el sorteo.')
			const userIds = students.map((student) => student.id)
			const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
			const draw: StudentDraw = { type: 'student-draw', id: crypto.randomUUID(), userIds, winnerId: userIds[Math.floor(random * userIds.length)], startedAt: Date.now() + 200 }
			this.ctx.storage.sql.exec('INSERT OR REPLACE INTO student_draw (id, ends_at) VALUES (1, ?)', draw.startedAt + DRAW_DURATION)
			for (const { attachment } of this.questionPeers()) room.sendCustomMessage(attachment.sessionId, draw)
			return { status: 200, body: this.questionPermissions(user) }
		}
		if (command.action === 'permission') {
			if (user.role !== 'teacher') return denied(403, 'Solo el maestro puede dar permiso.')
			const peers = this.questionPeers().filter((peer) => peer.user.id === command.userId && peer.user.role === 'student')
			if (command.allowed && !peers.length) return denied(409, 'El alumno ya no está conectado.')
			this.questionPermissions(user)
			if (command.allowed) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO question_permissions (user_id) VALUES (?)', command.userId)
			else this.ctx.storage.sql.exec('DELETE FROM question_permissions WHERE user_id = ?', command.userId)
		} else {
			this.ensurePointOutbox()
			await this.importPointReceipts(roomId)
			// Schedule recovery before recording an answer, including when the last socket closes.
			if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 60_000)
			// Recheck permission after alarm I/O, immediately before the synchronous answer transaction.
			if (user.role !== 'student' || !this.questionPermissions(user).allowedUserIds.includes(user.id)) return denied(403, 'Espera a que el maestro te dé permiso para responder.')
			const eventId = crypto.randomUUID()
			let feedback: QuestionFeedback | null = null
			const result = room.storage.transaction((store) => {
				const shape = store.get(command.shapeId)
				if (!shape || shape.typeName !== 'shape' || shape.type !== 'question') return 'Esta pregunta ya no existe.'
				if (shape.props.revision !== command.revision) return 'La pregunta cambió. Vuelve a elegir una respuesta.'
				if (shape.props.answered.includes(command.answer)) return 'Esa respuesta ya fue elegida.'
				const correct = command.answer === shape.props.correct
				feedback = { type: 'question-result', id: eventId, shapeId: command.shapeId, revision: command.revision, answer: command.answer, correct }
				if (correct) {
					const award: PointAward = { sourceKey: JSON.stringify(['question', roomId, shape.id, shape.props.revision]), eventId, userId: user.id, activityKind: 'question', amount: shape.props.points, createdAt: Date.now() }
					// Reserve the reward with the answer, without waiting for the balance database.
					const claimed = this.ctx.storage.sql.exec('INSERT OR IGNORE INTO point_receipts (source_key) VALUES (?) RETURNING source_key', award.sourceKey).toArray().length > 0
					if (claimed) {
						feedback.points = award.amount
						this.ctx.storage.sql.exec('INSERT INTO point_outbox (event_id, payload) VALUES (?, ?)', eventId, JSON.stringify({ award, feedback }))
					}
				}
				store.set(shape.id, { ...shape, props: { ...shape.props, answered: [...shape.props.answered, command.answer] } })
				return null
			}).result
			if (result) return denied(409, result)
			if (feedback) for (const { attachment } of this.questionPeers()) room.sendCustomMessage(attachment.sessionId, feedback)
			// The accepted answer celebrates immediately. The durable queue handles saving and retries.
			this.ctx.waitUntil(this.flushPointAwards().catch(() => { console.warn('Point award synchronization deferred; recovery alarm scheduled.') }))
		}
		this.broadcastQuestionPermissions()
		return { status: 200, body: this.questionPermissions(user) }
	}

	private async spinGachapon(roomId: string, user: PortalUser, command: Extract<QuestionCommand, { action: 'gachapon' }>) {
		const denied = (status: number, message: string) => ({ status, body: { error: message } })
		if (user.role !== 'student' || !this.questionPermissions(user).allowedUserIds.includes(user.id)) return denied(403, 'Espera el permiso del maestro y activa el cursor.')
		const room = this.getOrCreateRoom()
		const shape = room.storage.transaction((store) => store.get(command.shapeId)).result
		if (!shape || shape.typeName !== 'shape' || shape.type !== 'gachapon' || shape.props.revision !== command.revision) return denied(409, 'La máquina cambió. Vuelve a intentarlo.')
		if (shape.props.cost !== command.cost) return denied(409, 'El costo cambió. Revisa el precio antes de girar.')
		if (!shape.props.allowedUserIds.includes(user.id)) return denied(403, 'El maestro aún no te habilita en esta máquina.')
		if (shape.props.usedUserIds.includes(user.id)) return denied(409, 'Ya usaste tu tirada. Espera a que el maestro reinicie la máquina.')
		this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS gachapon_busy (shape_id TEXT PRIMARY KEY, ends_at INTEGER NOT NULL)')
		const previous = this.ctx.storage.sql.exec<{ ends_at: number }>('SELECT ends_at FROM gachapon_busy WHERE shape_id = ?', shape.id).toArray()[0]
		if (this.gachaBusy.has(shape.id) || previous && previous.ends_at > Date.now()) return denied(409, 'Espera a que salga el premio actual.')
		this.gachaBusy.add(shape.id)
		try {
			const skin = shape.props.pool[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * shape.props.pool.length)] as RewardSkin
			const source = JSON.stringify(['gachapon', roomId, shape.id, shape.props.revision, user.id])
			// The unique claim and the permanent unlock are the same D1 row. A retry cannot choose again.
			const claimed = await this.env.PORTAL_DB!.prepare(`INSERT OR IGNORE INTO gachapon_spins (source_key, user_id, skin, created_at, cost)
				SELECT ?, ?, ?, ?, ? WHERE ? <=
				COALESCE((SELECT SUM(amount) FROM point_awards WHERE user_id = ?), 0) - COALESCE((SELECT SUM(cost) FROM gachapon_spins WHERE user_id = ?), 0)
				RETURNING skin`).bind(source, user.id, skin, Date.now(), shape.props.cost, shape.props.cost, user.id, user.id).first()
			if (!claimed) {
				const used = await this.env.PORTAL_DB!.prepare('SELECT 1 FROM gachapon_spins WHERE source_key = ?').bind(source).first()
				return denied(409, used ? 'Ya usaste tu tirada. Espera a que el maestro reinicie la máquina.' : `Necesitas ${shape.props.cost} puntos para esta tirada.`)
			}
			room.storage.transaction((store) => {
				const current = store.get(shape.id)
				if (current?.typeName === 'shape' && current.type === 'gachapon' && current.props.revision === shape.props.revision) store.set(current.id, { ...current, props: { ...current.props, usedUserIds: [...new Set([...current.props.usedUserIds, user.id])] } })
			})
			const result: GachaponResult = { type: 'gachapon-result', id: crypto.randomUUID(), shapeId: shape.id, userId: user.id, name: user.name, skin, startedAt: Date.now() + 150 }
			this.ctx.storage.sql.exec('INSERT OR REPLACE INTO gachapon_busy (shape_id, ends_at) VALUES (?, ?)', shape.id, result.startedAt + GACHAPON_DURATION)
			for (const { attachment } of this.questionPeers()) room.sendCustomMessage(attachment.sessionId, result)
			return { status: 200, body: result }
		} finally { this.gachaBusy.delete(shape.id) }
	}

	private ensurePointOutbox() {
		this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS point_outbox (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
		this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS point_receipts (source_key TEXT PRIMARY KEY)')
		this.ctx.storage.sql.exec("INSERT OR IGNORE INTO point_receipts (source_key) SELECT json_extract(payload, '$.award.sourceKey') FROM point_outbox")
	}

	private async importPointReceipts(roomId: string) {
		if (this.pointReceiptsImported) return
		try {
			// Preserve deduplication for awards saved before local receipts were introduced.
			const saved = await this.env.PORTAL_DB!.prepare("SELECT source_key FROM point_awards WHERE activity_kind = 'question' AND json_extract(source_key, '$[1]') = ?").bind(roomId).all<{ source_key: string }>()
			this.ctx.storage.transactionSync(() => {
				for (const row of saved.results) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO point_receipts (source_key) VALUES (?)', row.source_key)
			})
			this.pointReceiptsImported = true
		} catch { /* A missing balance database cannot block an accepted answer. */ }
	}

	private flushPointAwards(): Promise<void> {
		if (this.pointsFlush) return this.pointsFlush
		this.ensurePointOutbox()
		this.pointsFlush = (async () => {
			while (true) {
				const row = this.ctx.storage.sql.exec<{ event_id: string; payload: string }>('SELECT event_id, payload FROM point_outbox LIMIT 1').toArray()[0]
				if (!row) return
				const { award } = JSON.parse(row.payload) as { award: PointAward }
				await savePointAward(this.env, award)
				this.ctx.storage.sql.exec('DELETE FROM point_outbox WHERE event_id = ?', row.event_id)
			}
		})().finally(() => { this.pointsFlush = null })
		return this.pointsFlush
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

	override async alarm() {
		await this.revalidatePortalSessions()
		try { await this.flushPointAwards() }
		catch { await this.ctx.storage.setAlarm(Date.now() + 60_000) }
	}

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
