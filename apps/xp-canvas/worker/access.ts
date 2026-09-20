import { isBoardId } from '../shared/boards'
import { getPortalSession, portalEnabled } from './portalAuth'

export interface CanvasEnv extends Env {
	ACCESS_MODE?: string
	PORTAL_DB?: D1Database
	PORTAL_PASSWORD_PEPPER?: string
	PORTAL_ADMIN_USERNAME?: string
	PORTAL_BOOTSTRAP_PASSWORD?: string
	EDITOR_AUTH_REQUIRED?: string
	EDITOR_CODE?: string
	EDITOR_SESSION_SECRET?: string
}

export const INTERNAL_ROLE_HEADER = 'x-xp-canvas-role'
export const ROOM_ID = 'principal'

const encoder = new TextEncoder()
const SESSION_TTL_SECONDS = 12 * 60 * 60
const PRODUCTION_COOKIE = '__Host-xp_canvas_editor'
const DEVELOPMENT_COOKIE = 'xp_canvas_editor'

function getCookie(request: Request, name: string) {
	const cookies = request.headers.get('cookie')?.split(';') ?? []
	for (const cookie of cookies) {
		const separator = cookie.indexOf('=')
		if (separator === -1) continue
		if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim()
	}
	return null
}

function toBase64Url(bytes: Uint8Array) {
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function digest(value: string) {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function sign(value: string, secret: string) {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

export async function tokensMatch(candidate: string | null, expected: string | undefined) {
	if (!candidate || !expected) return false

	const [candidateDigest, expectedDigest] = await Promise.all([digest(candidate), digest(expected)])
	let difference = 0
	for (let index = 0; index < candidateDigest.length; index++) {
		difference |= candidateDigest[index] ^ expectedDigest[index]
	}
	return difference === 0
}

export function isSameOrigin(request: Request) {
	const origin = request.headers.get('origin')
	return !origin || origin === new URL(request.url).origin
}

export async function editorCodeMatches(code: string | null, env: CanvasEnv) {
	return tokensMatch(code, env.EDITOR_CODE?.trim())
}

export async function getEditorSession(request: Request, env: CanvasEnv) {
	if (portalEnabled(env)) {
		const session = await getPortalSession(request, env)
		return session?.user.role === 'teacher' && !session.user.mustChangePassword ? { expires: Math.floor(session.expiresAt / 1000) } : null
	}
	// Open editing is explicit; missing or misspelled config keeps authentication on.
	if (!editorAuthRequired(env)) return { expires: null }
	const secret = env.EDITOR_SESSION_SECRET?.trim()
	if (!secret) return null

	const value = getCookie(request, PRODUCTION_COOKIE) ?? getCookie(request, DEVELOPMENT_COOKIE)
	if (!value) return null

	const [expiresText, signature] = value.split('.', 2)
	const expires = Number(expiresText)
	const now = Math.floor(Date.now() / 1000)
	if (!signature || !Number.isSafeInteger(expires) || expires <= now) return null
	if (expires > now + SESSION_TTL_SECONDS + 60) return null

	return (await tokensMatch(signature, await sign(`editor:${expires}:${ROOM_ID}`, secret)))
		? { expires }
		: null
}

export function editorAuthRequired(env: CanvasEnv) {
	return portalEnabled(env) || env.EDITOR_AUTH_REQUIRED !== 'false'
}

export async function requestCanEdit(request: Request, env: CanvasEnv) {
	return (await getEditorSession(request, env)) !== null
}

export async function createEditorCookie(request: Request, env: CanvasEnv) {
	const secret = env.EDITOR_SESSION_SECRET?.trim()
	if (!secret) throw new Error('EDITOR_SESSION_SECRET is not configured')

	const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
	const signature = await sign(`editor:${expires}:${ROOM_ID}`, secret)
	const secure = new URL(request.url).protocol === 'https:'
	const name = secure ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE
	return `${name}=${expires}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
}

export function clearEditorCookies() {
	return [
		`${PRODUCTION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`,
		`${DEVELOPMENT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
	]
}

export function withoutCredentials(request: Request) {
	const headers = new Headers(request.headers)
	headers.delete('cookie')
	headers.delete('authorization')
	headers.delete(INTERNAL_ROLE_HEADER)
	headers.delete('x-xp-canvas-auth-exp')
	headers.delete('x-xp-canvas-identity')
	return headers
}

export function isValidRoomId(roomId: string) {
	return isBoardId(roomId)
}
