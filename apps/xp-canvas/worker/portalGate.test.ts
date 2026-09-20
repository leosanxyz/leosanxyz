import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './worker'
import type { CanvasEnv } from './access'
import { allowedBoardIds, canReadBoard, type AuthSession } from './portalAuth'

vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }))
afterEach(() => vi.unstubAllEnvs())
const ctx = {} as ExecutionContext

describe('production portal boundary', () => {
	it('refuses to publish the local open-editor APIs as a production service', async () => {
		vi.stubEnv('DEV', false)
		for (const mode of [undefined, 'local', 'Portal']) {
			const response = await worker.fetch(new Request('https://canvas.test/api/library'), { ACCESS_MODE: mode, EDITOR_AUTH_REQUIRED: 'false' } as CanvasEnv, ctx)
			expect(response.status).toBe(503)
		}
	})
	it('keeps health/login discovery public but denies unauthenticated documents', async () => {
		vi.stubEnv('DEV', false)
		const env = { ACCESS_MODE: 'portal' } as CanvasEnv
		expect((await worker.fetch(new Request('https://canvas.test/api/health'), env, ctx)).status).toBe(200)
		expect(await (await worker.fetch(new Request('https://canvas.test/api/portal/session'), env, ctx)).json()).toEqual({ mode: 'portal', user: null })
		expect((await worker.fetch(new Request('https://canvas.test/api/boards/principal'), env, ctx)).status).toBe(401)
	})
	it('ignores the old editor cookie and client-supplied role/identity headers', async () => {
		vi.stubEnv('DEV', false)
		const env = { ACCESS_MODE: 'portal', EDITOR_AUTH_REQUIRED: 'false' } as CanvasEnv
		const request = new Request('https://canvas.test/api/library', { headers: { cookie: '__Host-xp_canvas_editor=anything', 'x-xp-canvas-role': 'editor', 'x-xp-canvas-identity': 'teacher' } })
		expect((await worker.fetch(request, env, ctx)).status).toBe(401)
	})
	it('requires the welcome to be completed before documents, assets or WebSockets', async () => {
		vi.stubEnv('DEV', false)
		const row = { id: 'student', username: 'A001', name: 'Ana', role: 'student', must_change: 0, version: 1, group_id: null, completed_at: null, expires_at: Date.now() + 60_000 }
		const first = vi.fn().mockResolvedValue(row)
		const env = { ACCESS_MODE: 'portal', PORTAL_DB: { prepare: () => ({ bind: () => ({ first }) }) } } as unknown as CanvasEnv
		for (const path of ['/api/library', '/api/boards/principal', '/api/uploads/unknown-upload-123', '/api/connect/principal?sessionId=abcdefghijklmnop']) {
			const request = new Request(`https://canvas.test${path}`, { headers: { cookie: `__Host-xp_portal=${'a'.repeat(64)}` } })
			const response = await worker.fetch(request, env, ctx)
			expect(response.status).toBe(403)
			expect(await response.json()).toEqual({ error: 'Termina tu bienvenida antes de entrar a tus clases.' })
		}
		const session = { user: { id: 'student', username: 'A001', name: 'Ana', role: 'student', mustChangePassword: false }, passCompleted: false } as AuthSession
		expect(await canReadBoard(session, 'principal', env)).toBe(false)
		expect(await allowedBoardIds(session, env)).toEqual(new Set())
	})
})
