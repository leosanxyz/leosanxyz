import type { CanvasEnv } from './access'
import type { PortalUser } from '../shared/portal'
import { scrypt } from 'node:crypto'

const encoder = new TextEncoder()
const SESSION_SECONDS = 7 * 24 * 60 * 60
const LOGIN_WINDOW = 15 * 60 * 1000
// OWASP's 16 MiB scrypt profile; Workers implements node:crypto natively.
// Keep the extra HMAC pepper outside D1 and Git.
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 5
const HASH_FORMAT = `scrypt-hmac$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}`
export const TEACHER_ID = 'teacher'
export const PORTAL_IDENTITY_HEADER = 'x-xp-canvas-identity'

export interface UserRow {
	id: string; username: string; name: string; role: 'teacher' | 'student'
	password_hash: string | null; must_change: number; disabled: number; version: number; group_id: string | null
}
export interface AuthSession {
	user: PortalUser
	groupId: string | null
	version: number
	tokenHash: string
	expiresAt: number
	passCompleted: boolean
}

export function portalEnabled(env: CanvasEnv) { return env.ACCESS_MODE === 'portal' }
export function portalDb(env: CanvasEnv) {
	if (!env.PORTAL_DB) throw new Error('PORTAL_DB is not configured')
	return env.PORTAL_DB
}
export function publicUser(row: UserRow): PortalUser {
	return { id: row.id, username: row.username, name: row.name, role: row.role, mustChangePassword: Boolean(row.must_change) }
}
export function normalizeUsername(value: unknown) {
	return typeof value === 'string' ? value.trim().toUpperCase() : ''
}
export function validUsername(value: string) { return /^[A-Z0-9][A-Z0-9._-]{2,31}$/.test(value) }
export function passwordProblem(password: unknown, username: string): string | null {
	if (typeof password !== 'string' || password.length < 10 || password.length > 128 || !password.trim()) return 'Elige una contraseña de entre 10 y 128 caracteres.'
	if (normalizeUsername(password) === username) return 'La nueva contraseña debe ser diferente de tu matrícula.'
	return null
}
function hex(bytes: ArrayBuffer | Uint8Array) { return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('') }
function fromHex(value: string) { return Uint8Array.from(value.match(/../g) ?? [], (v) => parseInt(v, 16)) }
export async function hashToken(value: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))) }
export async function constantMatch(a: string, b: string) {
	const [x, y] = await Promise.all([hashToken(a), hashToken(b)])
	let diff = 0
	for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
	return diff === 0
}
async function passwordDigest(password: string, salt: string, env: CanvasEnv) {
	if (!env.PORTAL_PASSWORD_PEPPER || env.PORTAL_PASSWORD_PEPPER.length < 32) throw new Error('Configure a random PORTAL_PASSWORD_PEPPER of at least 32 characters')
	const derived = await new Promise<Uint8Array>((resolve, reject) => {
		scrypt(password, fromHex(salt), 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 32 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(new Uint8Array(result)))
	})
	const pepper = await crypto.subtle.importKey('raw', encoder.encode(env.PORTAL_PASSWORD_PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
	return hex(await crypto.subtle.sign('HMAC', pepper, derived))
}
export async function hashPassword(password: string, env: CanvasEnv) {
	const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
	return `${HASH_FORMAT}$${salt}$${await passwordDigest(password, salt, env)}`
}
export async function verifyPassword(password: string, encoded: string | null, env: CanvasEnv) {
	const [format, n, r, p, salt, expected] = (encoded ?? '').split('$')
	const valid = `${format}$${n}$${r}$${p}` === HASH_FORMAT && /^[a-f0-9]{32}$/.test(salt ?? '') && /^[a-f0-9]{64}$/.test(expected ?? '')
	const actual = await passwordDigest(password, valid ? salt : '00000000000000000000000000000000', env)
	return valid && await constantMatch(actual, expected)
}
function cookieName(request: Request) { return new URL(request.url).protocol === 'https:' ? '__Host-xp_portal' : 'xp_portal' }
function cookie(request: Request, token: string, maxAge: number) {
	return `${cookieName(request)}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}
export function clearPortalCookie(request: Request) { return cookie(request, '', 0) }
function readToken(request: Request) {
	const name = cookieName(request)
	return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''
}
export async function sessionByHash(tokenHash: string, env: CanvasEnv): Promise<AuthSession | null> {
	const row = await portalDb(env).prepare(`SELECT u.*, s.expires_at, p.completed_at FROM sessions s JOIN users u ON u.id = s.user_id
		LEFT JOIN student_passes p ON p.user_id = u.id
		WHERE s.token_hash = ? AND s.expires_at > ? AND s.user_version = u.version AND u.disabled = 0`).bind(tokenHash, Date.now()).first<UserRow & { expires_at: number; completed_at: number | null }>()
	return row ? { user: publicUser(row), groupId: row.group_id, version: row.version, tokenHash, expiresAt: row.expires_at, passCompleted: row.completed_at != null } : null
}
const requestSessions = new WeakMap<Request, Promise<AuthSession | null>>()
export function getPortalSession(request: Request, env: CanvasEnv) {
	let session = requestSessions.get(request)
	if (!session) {
		const token = readToken(request)
		session = /^[a-f0-9]{64}$/.test(token) ? hashToken(token).then((hash) => sessionByHash(hash, env)) : Promise.resolve(null)
		requestSessions.set(request, session)
	}
	return session
}
export async function createPortalSession(request: Request, row: UserRow, env: CanvasEnv) {
	const token = hex(crypto.getRandomValues(new Uint8Array(32)))
	await portalDb(env).prepare('INSERT INTO sessions (token_hash, user_id, user_version, expires_at) VALUES (?, ?, ?, ?)')
		.bind(await hashToken(token), row.id, row.version, Date.now() + SESSION_SECONDS * 1000).run()
	return cookie(request, token, SESSION_SECONDS)
}
export async function allowedBoardIds(session: AuthSession, env: CanvasEnv) {
	if (session.user.mustChangePassword || session.user.role === 'student' && !session.passCompleted) return new Set<string>()
	const { results } = await portalDb(env).prepare(`SELECT DISTINCT board_id FROM board_grants WHERE (kind = 'user' AND subject_id = ?) OR (kind = 'group' AND subject_id = ?)`)
		.bind(session.user.id, session.groupId ?? '').all<{ board_id: string }>()
	return new Set(results.map((row) => row.board_id))
}
export async function canReadBoard(session: AuthSession | null, boardId: string, env: CanvasEnv) {
	if (!session || session.user.mustChangePassword) return false
	if (session.user.role === 'teacher') return true
	if (!session.passCompleted) return false
	return Boolean(await portalDb(env).prepare(`SELECT 1 FROM board_grants WHERE board_id = ? AND ((kind = 'user' AND subject_id = ?) OR (kind = 'group' AND subject_id = ?)) LIMIT 1`)
		.bind(boardId, session.user.id, session.groupId ?? '').first())
}
export async function loginAllowed(request: Request, username: string, env: CanvasEnv) {
	const db = portalDb(env), now = Date.now(), window = Math.floor(now / LOGIN_WINDOW) * LOGIN_WINDOW
	// CF-Connecting-IP is set by Cloudflare, not an untrusted X-Forwarded-For header.
	const keys = [`ip:${request.headers.get('cf-connecting-ip') ?? 'local'}`, `user:${username}`]
	const hashes = await Promise.all(keys.map(hashToken))
	for (const [index, key] of hashes.entries()) {
		const row = await db.prepare(`INSERT INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)
			ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END, window_start = excluded.window_start RETURNING count`)
			.bind(key, window).first<{ count: number }>()
		if (!row || row.count > (index === 0 ? 120 : 12)) return false
	}
	return true
}
