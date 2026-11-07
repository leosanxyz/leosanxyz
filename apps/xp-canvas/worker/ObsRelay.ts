import { DurableObject } from 'cloudflare:workers'
import { OBS_SIN_ESTADO, readEstado, type ObsEstado, type ObsVista } from '../shared/obs'

export const OBS_ROLE_HEADER = 'x-xp-obs-role'
type Role = 'dock' | 'viewer'
const OPEN = 1

/**
 * One relay for the whole portal: the OBS dock on Leo's Mac and every canvas client meet here.
 * The dock's last state lives in its socket attachment, so it survives hibernation and disappears with the dock.
 */
export class ObsRelay extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		// Keepalives are answered without waking the object.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
	}

	async fetch(request: Request) {
		const role = request.headers.get(OBS_ROLE_HEADER)
		if (role !== 'dock' && role !== 'viewer') return new Response('Not found', { status: 404 })
		const { 0: client, 1: server } = new WebSocketPair()
		this.accept(server, role)
		return new Response(null, { status: 101, webSocket: client, headers: role === 'dock' ? { 'sec-websocket-protocol': 'obs-relay' } : {} })
	}

	accept(socket: WebSocket, role: Role) {
		// A reconnecting dock may arrive before the server notices the old one dropped; the newest wins.
		if (role === 'dock') for (const old of this.ctx.getWebSockets('dock')) old.close(4000, 'Otro dock se conectó')
		this.ctx.acceptWebSocket(socket, [role])
		if (role === 'dock') this.broadcast()
		else socket.send(JSON.stringify(this.vista()))
	}

	/** Sends the jump to the connected dock. False when OBS isn't there to receive it. */
	irA(capitulo: number) {
		const dock = this.dock()
		if (!dock) return false
		dock.send(JSON.stringify({ tipo: 'ir_a', capitulo }))
		return true
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
		if (!this.ctx.getTags(socket).includes('dock') || typeof message !== 'string' || message.length > 64_000) return
		let estado: ObsEstado | null = null
		try { estado = readEstado(JSON.parse(message)) } catch { return }
		if (!estado) return
		socket.serializeAttachment(estado)
		this.broadcast()
	}

	webSocketClose(socket: WebSocket, code: number, reason: string) {
		try { socket.close(code, reason) } catch { /* Already closed, or a code that can't be echoed. */ }
		if (this.ctx.getTags(socket).includes('dock')) this.broadcast()
	}

	webSocketError(socket: WebSocket) {
		if (this.ctx.getTags(socket).includes('dock')) this.broadcast()
	}

	private dock() {
		return this.ctx.getWebSockets('dock').find((socket) => socket.readyState === OPEN)
	}

	private vista(): ObsVista {
		const dock = this.dock()
		return dock ? { obs: true, ...(dock.deserializeAttachment() as ObsEstado | null ?? OBS_SIN_ESTADO) } : { obs: false }
	}

	private broadcast() {
		const data = JSON.stringify(this.vista())
		for (const viewer of this.ctx.getWebSockets('viewer')) {
			try { viewer.send(data) } catch { /* Its close handler cleans up. */ }
		}
	}
}
