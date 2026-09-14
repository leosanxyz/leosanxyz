import { describe, expect, it } from 'vitest'
import {
	createEditorCookie,
	editorCodeMatches,
	editorAuthRequired,
	getEditorSession,
	isValidRoomId,
	requestCanEdit,
	type CanvasEnv,
} from './access'

const env = {
	EDITOR_CODE: 'correct-horse-battery-staple',
	EDITOR_SESSION_SECRET: 'a-different-session-secret-with-enough-entropy',
} as CanvasEnv

describe('editor access', () => {
	it('allows editing without cookies or secrets only when explicitly configured', async () => {
		const request = new Request('http://localhost/api/editor-session')
		const openEnv = { EDITOR_AUTH_REQUIRED: 'false' } as CanvasEnv
		expect(editorAuthRequired(openEnv)).toBe(false)
		expect(await requestCanEdit(request, openEnv)).toBe(true)
		expect(await getEditorSession(request, openEnv)).toEqual({ expires: null })
		for (const value of [undefined, 'true', 'False', '']) {
			const protectedEnv = { EDITOR_AUTH_REQUIRED: value } as CanvasEnv
			expect(editorAuthRequired(protectedEnv)).toBe(true)
			expect(await requestCanEdit(request, protectedEnv)).toBe(false)
		}
	})

	it('exchanges the code for a signed session without exposing the code', async () => {
		const request = new Request('http://localhost/api/editor-session')
		const cookie = await createEditorCookie(request, env)
		const cookiePair = cookie.split(';', 1)[0]

		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('SameSite=Strict')
		expect(cookie).not.toContain(env.EDITOR_CODE!)
		expect(
			await requestCanEdit(
				new Request('http://localhost/api/connect/principal', {
					headers: { cookie: cookiePair },
				}),
				env
			)
		).toBe(true)
	})

	it('rejects a modified session and the wrong editor code', async () => {
		const cookie = (await createEditorCookie(new Request('http://localhost/'), env)).split(';', 1)[0]
		const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`

		expect(
			await requestCanEdit(
				new Request('http://localhost/api/connect/principal', {
					headers: { cookie: tampered },
				}),
				env
			)
		).toBe(false)
		expect(await editorCodeMatches('wrong', env)).toBe(false)
		expect(await editorCodeMatches(env.EDITOR_CODE!, env)).toBe(true)
	})

	it('accepts the original board and generated board IDs, never arbitrary paths', () => {
		expect(isValidRoomId('principal')).toBe(true)
		expect(isValidRoomId('8f309661-9e55-4c49-bd7e-1e2fb3787e68')).toBe(true)
		expect(isValidRoomId('otra-sala')).toBe(false)
		expect(isValidRoomId('../principal')).toBe(false)
		expect(isValidRoomId('__catalog__')).toBe(false)
	})
})
