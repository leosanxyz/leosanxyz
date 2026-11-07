import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './worker'
import { ObsRelay, OBS_ROLE_HEADER } from './ObsRelay'
import type { CanvasEnv } from './access'

vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }))
beforeEach(() => { vi.stubEnv('DEV', false); vi.stubGlobal('WebSocketRequestResponsePair', class {}) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const TOKEN = 'ab'.repeat(32)
const ctx = {} as ExecutionContext

function fakeEnv({ token = TOKEN as string | null, role = 'teacher', delivered = true } = {}) {
	const stub = { fetch: vi.fn(async (_url: string, _init?: RequestInit) => new Response('relay')), irA: vi.fn(async () => delivered) }
	const row = { id: role, username: 'LEO', name: 'Leo', role, must_change: 0, version: 1, group_id: null, completed_at: 1, expires_at: Date.now() + 60_000 }
	const env = {
		ACCESS_MODE: 'portal', OBS_RELAY_TOKEN: token ?? undefined,
		OBS_RELAY: { idFromName: (name: string) => name, get: () => stub },
		PORTAL_DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) },
	} as unknown as CanvasEnv
	return { env, stub }
}
const dockRequest = (protocols: string) => new Request('https://xp.test/api/obs/relay', { headers: { upgrade: 'websocket', 'sec-websocket-protocol': protocols, origin: 'null' } })
const chapter = (capitulo: unknown) => new Request('https://xp.test/api/obs/capitulo', {
	method: 'POST', body: JSON.stringify({ capitulo }),
	headers: { 'content-type': 'application/json', cookie: `__Host-xp_portal=${'a'.repeat(64)}` },
})

describe('OBS dock authentication', () => {
	it('lets the dock in with the right token, from file:// and without a portal cookie', async () => {
		const { env, stub } = fakeEnv()
		expect(await (await worker.fetch(dockRequest(`obs-relay, ${TOKEN}`), env, ctx)).text()).toBe('relay')
		const init = stub.fetch.mock.calls[0][1]!
		expect(new Headers(init.headers).get(OBS_ROLE_HEADER)).toBe('dock')
	})
	it('rejects a wrong token, a missing token and a missing secret', async () => {
		for (const [protocols, token] of [[`obs-relay, ${'cd'.repeat(32)}`, TOKEN], ['obs-relay', TOKEN], [TOKEN, TOKEN], [`obs-relay, ${TOKEN}`, null], ['obs-relay, ', '']] as const) {
			const { env, stub } = fakeEnv({ token })
			expect((await worker.fetch(dockRequest(protocols), env, ctx)).status).toBe(401)
			expect(stub.fetch).not.toHaveBeenCalled()
		}
	})
})

describe('chapter jump', () => {
	it('is only for the teacher', async () => {
		const { env, stub } = fakeEnv({ role: 'student' })
		expect((await worker.fetch(chapter(2), env, ctx)).status).toBe(403)
		expect(stub.irA).not.toHaveBeenCalled()
	})
	it('reaches the dock, or answers 409 when there is none', async () => {
		const ok = fakeEnv()
		expect((await worker.fetch(chapter(3), ok.env, ctx)).status).toBe(200)
		expect(ok.stub.irA).toHaveBeenCalledWith(3)
		expect((await worker.fetch(chapter(3), fakeEnv({ delivered: false }).env, ctx)).status).toBe(409)
		expect((await worker.fetch(chapter(0), ok.env, ctx)).status).toBe(400)
	})
	it('lets students read the state but not unauthenticated visitors', async () => {
		const student = fakeEnv({ role: 'student' })
		const request = (cookie: boolean) => new Request('https://xp.test/api/obs/estado', { headers: { upgrade: 'websocket', ...(cookie ? { cookie: `__Host-xp_portal=${'a'.repeat(64)}` } : {}) } })
		expect(await (await worker.fetch(request(true), student.env, ctx)).text()).toBe('relay')
		expect(new Headers(student.stub.fetch.mock.calls[0][1]!.headers).get(OBS_ROLE_HEADER)).toBe('viewer')
		expect((await worker.fetch(request(false), student.env, ctx)).status).toBe(401)
	})
})

function fakeSocket() {
	let attachment: unknown = null
	const socket = {
		readyState: 1, sent: [] as unknown[],
		send(data: string) { socket.sent.push(JSON.parse(data)) },
		close() { socket.readyState = 3 },
		serializeAttachment(value: unknown) { attachment = value },
		deserializeAttachment() { return attachment },
	}
	return socket
}
function fakeRelay() {
	const sockets: { socket: ReturnType<typeof fakeSocket>; tags: string[] }[] = []
	const state = {
		setWebSocketAutoResponse() {},
		acceptWebSocket(socket: ReturnType<typeof fakeSocket>, tags: string[]) { sockets.push({ socket, tags }) },
		getWebSockets(tag: string) { return sockets.filter((entry) => entry.tags.includes(tag)).map((entry) => entry.socket) },
		getTags(socket: unknown) { return sockets.find((entry) => entry.socket === socket)?.tags ?? [] },
	}
	const relay = new ObsRelay(state as unknown as DurableObjectState, {} as Env)
	const connect = (role: 'dock' | 'viewer') => { const socket = fakeSocket(); relay.accept(socket as unknown as WebSocket, role); return socket }
	const message = (socket: ReturnType<typeof fakeSocket>, data: unknown) => relay.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(data))
	return { relay, connect, message }
}

describe('ObsRelay', () => {
	const estado = { tipo: 'estado', capitulo: 2, titulos: ['Repaso', 'Plan'], visible: true, sonando: { titulo: 'Shelter', artista: 'Porter Robinson', portada: 'https://img.test/a.jpg' } }

	it('relays the dock state and song to every viewer, and obs:false when the dock leaves', () => {
		const { relay, connect, message } = fakeRelay()
		const student = connect('viewer')
		expect(student.sent).toEqual([{ obs: false }])
		const dock = connect('dock')
		expect(student.sent.at(-1)).toEqual({ obs: true, capitulo: 0, titulos: [], visible: false, sonando: null })
		message(dock, estado)
		expect(student.sent.at(-1)).toEqual({ obs: true, capitulo: 2, titulos: ['Repaso', 'Plan'], visible: true, sonando: estado.sonando })
		expect(connect('viewer').sent).toEqual([student.sent.at(-1)])
		dock.close()
		relay.webSocketClose(dock as unknown as WebSocket, 1006, '')
		expect(student.sent.at(-1)).toEqual({ obs: false })
	})
	it('forwards ir_a to the dock, and reports when there is no dock', () => {
		const { relay, connect } = fakeRelay()
		expect(relay.irA(3)).toBe(false)
		const dock = connect('dock')
		expect(relay.irA(3)).toBe(true)
		expect(dock.sent).toEqual([{ tipo: 'ir_a', capitulo: 3 }])
	})
	it('ignores state sent by viewers and keeps only the newest dock', () => {
		const { relay, connect, message } = fakeRelay()
		const student = connect('viewer')
		message(student, estado)
		expect(student.sent).toEqual([{ obs: false }])
		const old = connect('dock'), fresh = connect('dock')
		expect(old.readyState).toBe(3)
		relay.irA(4)
		expect(old.sent).toEqual([])
		expect(fresh.sent).toEqual([{ tipo: 'ir_a', capitulo: 4 }])
	})
})
