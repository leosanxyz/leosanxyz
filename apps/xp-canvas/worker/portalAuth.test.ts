import { describe, expect, it } from 'vitest'
import { hashPassword, normalizeUsername, passwordProblem, validUsername, verifyPassword } from './portalAuth'
import { bindPresence, documentReferencesAsset } from './portalPresence'
import { editorAuthRequired, getEditorSession, type CanvasEnv } from './access'

const env = { PORTAL_PASSWORD_PEPPER: 'unit-test-pepper-kept-out-of-production-123456789' } as CanvasEnv

describe('portal credentials', () => {
	it('normalizes identifiers without losing leading zeroes and rejects ambiguous input', () => {
		expect(normalizeUsername('  a001234  ')).toBe('A001234')
		expect(validUsername('A001234')).toBe(true)
		for (const value of ['A 001', '', '../123', 'x'.repeat(33)]) expect(validUsername(value)).toBe(false)
		expect(passwordProblem('A00123456789', 'A00123456789')).toContain('diferente')
		expect(passwordProblem('short', 'A001234')).toContain('10')
		expect(passwordProblem('una frase que recuerdo', 'A001234')).toBeNull()
	})
	it('salts passwords, rejects the initial identifier after hashing, and needs the same pepper', async () => {
		const password = 'una frase que recuerdo'
		const first = await hashPassword(password, env), second = await hashPassword(password, env)
		expect(first).not.toEqual(second)
		expect(first).not.toContain(password)
		expect(await verifyPassword(password, first, env)).toBe(true)
		expect(await verifyPassword('A001234', first, env)).toBe(false)
		expect(await verifyPassword(password, first, { PORTAL_PASSWORD_PEPPER: 'different-secret-for-another-environment-12345678' } as CanvasEnv)).toBe(false)
		expect(await verifyPassword(password, 'malformed', env)).toBe(false)
	})
	it('requires a configured pepper and never inherits local open editing in portal mode', async () => {
		await expect(hashPassword('example password', {} as CanvasEnv)).rejects.toThrow('PORTAL_PASSWORD_PEPPER')
		const portal = { ACCESS_MODE: 'portal', EDITOR_AUTH_REQUIRED: 'false' } as CanvasEnv
		expect(editorAuthRequired(portal)).toBe(true)
		expect(await getEditorSession(new Request('https://canvas.test/'), portal)).toBeNull()
	})
})

describe('authenticated presence and asset references', () => {
	it('overwrites identity in both complete and partial presence updates', () => {
		const identity = { id: 'student-123', name: 'Ana López' }
		const put = { type: 'push', presence: ['put', { userId: 'user:teacher', userName: 'Leo', cursor: { x: 1, y: 2 } }] }
		bindPresence(put, identity)
		expect(put.presence[1]).toEqual({ userId: 'user:student-123', userName: 'Ana López', cursor: { x: 1, y: 2 } })
		const patch = { type: 'push', presence: ['patch', { userId: ['put', 'user:teacher'], userName: ['append', 'fake', 3] }] }
		bindPresence(patch, identity)
		expect(patch.presence[1]).toEqual({ userId: ['put', 'user:student-123'], userName: ['put', 'Ana López'] })
	})
	it('only accepts exact asset paths, including nested previews, never substring matches', () => {
		const id = 'test-upload-123456'
		expect(documentReferencesAsset([{ state: { props: { src: `/api/uploads/${id}` } } }], id)).toBe(true)
		expect(documentReferencesAsset({ meta: { previewSrc: `https://previous-host.test/api/uploads/${id}?v=1` } }, id)).toBe(true)
		expect(documentReferencesAsset({ src: `/api/uploads/${id}-other` }, id)).toBe(false)
		expect(documentReferencesAsset({ src: `/api/other/${id}` }, id)).toBe(false)
		expect(documentReferencesAsset({ src: null }, id)).toBe(false)
	})
})
