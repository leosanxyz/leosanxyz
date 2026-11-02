import type { CanvasEnv } from './access'
import { isSameOrigin } from './access'
import { getPortalSession, hashToken, portalDb, portalEnabled } from './portalAuth'
import type { PortalUser } from '../shared/portal'

// OAuth 2.1 mínimo para que el agente de un alumno (Codex, ChatGPT) actúe en sus canvases personales.
// Clientes públicos con PKCE S256, registro dinámico y tokens que se renuevan. D1 guarda solo hashes.

const ACCESS_SECONDS = 60 * 60
const REFRESH_SECONDS = 120 * 24 * 60 * 60
const CODE_SECONDS = 5 * 60
const MAX_GRANTS = 5
export const AGENT_SCOPE = 'canvas'

const noStore = { 'cache-control': 'no-store' }
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers: { ...noStore, ...headers } })
const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status)
const randomToken = (prefix: string) => `${prefix}_${[...crypto.getRandomValues(new Uint8Array(32))].map((v) => v.toString(16).padStart(2, '0')).join('')}`
const origin = (request: Request) => new URL(request.url).origin
export const mcpResource = (request: Request) => `${origin(request)}/mcp`

export function authorizationServerMetadata(request: Request) {
	const base = origin(request)
	return json({
		issuer: base,
		authorization_endpoint: `${base}/autorizar`,
		token_endpoint: `${base}/api/oauth/token`,
		registration_endpoint: `${base}/api/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		scopes_supported: [AGENT_SCOPE],
	})
}
export function protectedResourceMetadata(request: Request) {
	return json({ resource: mcpResource(request), authorization_servers: [origin(request)], scopes_supported: [AGENT_SCOPE], bearer_methods_supported: ['header'], resource_name: 'XP Canvas' })
}

/** Native clients listen on a loopback port chosen at login time (RFC 8252), so the port is not compared. */
export function redirectMatches(registered: string, candidate: string) {
	try {
		const a = new URL(registered), b = new URL(candidate)
		const loopback = (url: URL) => url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
		if (loopback(a) && loopback(b)) return a.hostname === b.hostname && a.pathname === b.pathname
		return a.href === b.href
	} catch { return false }
}
export function validRedirect(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 500) return false
	try {
		const url = new URL(value)
		if (url.hash || url.username || url.password) return false
		return url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
	} catch { return false }
}

async function rateLimited(env: CanvasEnv, key: string, limit: number) {
	const window = Math.floor(Date.now() / (15 * 60 * 1000)) * 15 * 60 * 1000
	const row = await portalDb(env).prepare(`INSERT INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)
		ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END, window_start = excluded.window_start RETURNING count`)
		.bind(await hashToken(key), window).first<{ count: number }>()
	return !row || row.count > limit
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text()
	if (text.length > 8192) throw new Error('too large')
	if ((request.headers.get('content-type') ?? '').includes('application/json')) {
		const data = JSON.parse(text) as unknown
		return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
	}
	return Object.fromEntries(new URLSearchParams(text))
}

async function readClient(env: CanvasEnv, clientId: unknown) {
	if (typeof clientId !== 'string' || !/^[a-f0-9-]{36}$/.test(clientId)) return null
	const row = await portalDb(env).prepare('SELECT client_id, name, redirect_uris FROM oauth_clients WHERE client_id = ?').bind(clientId).first<{ client_id: string; name: string; redirect_uris: string }>()
	return row ? { id: row.client_id, name: row.name, redirectUris: JSON.parse(row.redirect_uris) as string[] } : null
}

async function sha256Base64Url(value: string) {
	const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

interface AuthorizeParams { client_id?: unknown; redirect_uri?: unknown; code_challenge?: unknown; code_challenge_method?: unknown; response_type?: unknown; resource?: unknown; state?: unknown }
async function checkAuthorize(request: Request, env: CanvasEnv, params: AuthorizeParams) {
	const client = await readClient(env, params.client_id)
	if (!client) return { problem: 'Este agente no está registrado. Vuelve a conectarlo desde tu Codex.' }
	if (typeof params.redirect_uri !== 'string' || !client.redirectUris.some((uri) => redirectMatches(uri, params.redirect_uri as string))) return { problem: 'La dirección de regreso del agente no coincide con la que registró.' }
	if (params.response_type !== 'code') return { problem: 'Solicitud inválida.' }
	if (typeof params.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge) || params.code_challenge_method !== 'S256') return { problem: 'El agente debe usar PKCE S256.' }
	if (params.resource != null && params.resource !== '' && params.resource !== mcpResource(request)) return { problem: 'Este permiso es para otro servidor.' }
	return { client, redirectUri: params.redirect_uri as string, challenge: params.code_challenge as string }
}

export async function handleOAuthRequest(request: Request, env: CanvasEnv): Promise<Response> {
	if (!portalEnabled(env)) return json({ error: 'not_found' }, 404)
	const path = new URL(request.url).pathname, db = portalDb(env)
	try {
		if (path === '/api/oauth/register' && request.method === 'POST') {
			if (await rateLimited(env, `oauth-register:${request.headers.get('cf-connecting-ip') ?? 'local'}`, 60)) return oauthError('slow_down', 'Demasiados registros. Espera unos minutos.', 429)
			const data = await readBody(request)
			const uris = data.redirect_uris
			if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every(validRedirect)) return oauthError('invalid_redirect_uri', 'Usa direcciones https o de loopback.')
			if (data.token_endpoint_auth_method != null && data.token_endpoint_auth_method !== 'none') return oauthError('invalid_client_metadata', 'Solo se admiten clientes públicos.')
			const name = typeof data.client_name === 'string' && data.client_name.trim() ? data.client_name.replace(/[\x00-\x1f]/g, '').trim().slice(0, 60) : 'Agente'
			const clientId = crypto.randomUUID(), now = Date.now()
			await db.prepare('INSERT INTO oauth_clients (client_id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)').bind(clientId, name, JSON.stringify(uris), now).run()
			return json({ client_id: clientId, client_id_issued_at: Math.floor(now / 1000), client_name: name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: AGENT_SCOPE }, 201)
		}

		if (path === '/api/oauth/authorize') {
			// The consent page (/autorizar) runs in the portal with the student's session cookie.
			if (request.method !== 'GET' && !isSameOrigin(request)) return json({ error: 'Origen inválido.' }, 403)
			const session = await getPortalSession(request, env)
			if (!session) return json({ error: 'Inicia sesión para continuar.' }, 401)
			const params = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams) : await readBody(request)
			const checked = await checkAuthorize(request, env, params)
			if ('problem' in checked) return json({ error: checked.problem }, 400)
			if (session.user.role !== 'student') return json({ error: 'Solo una cuenta de alumno puede conectar un agente.' }, 403)
			if (!session.passCompleted || session.user.mustChangePassword) return json({ error: 'Termina tu bienvenida antes de conectar un agente.' }, 403)
			// Codex and other local agents return to the student's own computer; anything else is named on the page.
			const target = new URL(checked.redirectUri)
			if (request.method === 'GET') return json({ client: checked.client.name, ...(target.protocol === 'https:' ? { returnsTo: target.host } : {}) })
			if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
			const back = new URL(checked.redirectUri)
			if (typeof params.state === 'string') back.searchParams.set('state', params.state)
			back.searchParams.set('iss', origin(request))
			if (params.approve !== true) {
				back.searchParams.set('error', 'access_denied')
				return json({ redirect: back.href })
			}
			const code = randomToken('xpc')
			await db.batch([
				db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').bind(Date.now()),
				db.prepare('INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
					.bind(await hashToken(code), checked.client.id, session.user.id, checked.redirectUri, checked.challenge, Date.now() + CODE_SECONDS * 1000),
			])
			back.searchParams.set('code', code)
			return json({ redirect: back.href })
		}

		if (path === '/api/oauth/token' && request.method === 'POST') {
			if (await rateLimited(env, `oauth-token:${request.headers.get('cf-connecting-ip') ?? 'local'}`, 300)) return oauthError('slow_down', 'Demasiadas solicitudes.', 429)
			const data = await readBody(request)
			const client = await readClient(env, data.client_id)
			if (!client) return oauthError('invalid_client', 'Cliente desconocido.', 401)
			const now = Date.now(), access = randomToken('xpa'), refresh = randomToken('xpr')
			const [accessHash, refreshHash] = await Promise.all([hashToken(access), hashToken(refresh)])
			const issued = () => json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: AGENT_SCOPE })
			if (data.grant_type === 'authorization_code') {
				if (typeof data.code !== 'string' || typeof data.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(data.code_verifier)) return oauthError('invalid_request', 'Faltan el código o el verificador.')
				// Single use: the row disappears whether or not the rest of the exchange succeeds.
				const row = await db.prepare('DELETE FROM oauth_codes WHERE code_hash = ? RETURNING client_id, user_id, redirect_uri, code_challenge, expires_at').bind(await hashToken(data.code))
					.first<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string; expires_at: number }>()
				if (!row || row.expires_at < now || row.client_id !== client.id) return oauthError('invalid_grant', 'El código no es válido o ya se usó.')
				if (typeof data.redirect_uri === 'string' && data.redirect_uri !== row.redirect_uri) return oauthError('invalid_grant', 'La dirección de regreso no coincide.')
				if (await sha256Base64Url(data.code_verifier) !== row.code_challenge) return oauthError('invalid_grant', 'El verificador PKCE no coincide.')
				if (!await activeStudent(env, row.user_id)) return oauthError('invalid_grant', 'La cuenta ya no está activa.')
				const old = await db.prepare('SELECT id FROM agent_grants WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC LIMIT -1 OFFSET ?').bind(row.user_id, MAX_GRANTS - 1).all<{ id: string }>()
				await db.batch([
					...old.results.map((grant) => db.prepare('DELETE FROM agent_grants WHERE id = ?').bind(grant.id)),
					db.prepare('INSERT INTO agent_grants (id, user_id, client_id, client_name, access_hash, access_expires_at, refresh_hash, refresh_expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
						.bind(crypto.randomUUID(), row.user_id, client.id, client.name, accessHash, now + ACCESS_SECONDS * 1000, refreshHash, now + REFRESH_SECONDS * 1000, now, now),
				])
				return issued()
			}
			if (data.grant_type === 'refresh_token') {
				if (typeof data.refresh_token !== 'string') return oauthError('invalid_request', 'Falta el token de renovación.')
				// Rotation: the old refresh token stops working the moment a new one is issued.
				const grant = await db.prepare(`UPDATE agent_grants SET access_hash = ?, access_expires_at = ?, refresh_hash = ?, refresh_expires_at = ?
					WHERE refresh_hash = ? AND client_id = ? AND refresh_expires_at > ? RETURNING user_id`)
					.bind(accessHash, now + ACCESS_SECONDS * 1000, refreshHash, now + REFRESH_SECONDS * 1000, await hashToken(data.refresh_token), client.id, now).first<{ user_id: string }>()
				if (!grant || !await activeStudent(env, grant.user_id)) return oauthError('invalid_grant', 'Vuelve a conectar tu agente.')
				return issued()
			}
			return oauthError('unsupported_grant_type', 'Tipo de permiso no admitido.')
		}
		return json({ error: 'not_found' }, 404)
	} catch (cause) {
		console.error('OAuth request failed', cause instanceof Error ? cause.message : 'Unknown error')
		return oauthError('invalid_request', 'No se pudo completar la solicitud.')
	}
}

async function activeStudent(env: CanvasEnv, userId: string) {
	return Boolean(await portalDb(env).prepare(`SELECT 1 FROM users u JOIN student_passes p ON p.user_id = u.id
		WHERE u.id = ? AND u.role = 'student' AND u.disabled = 0 AND u.must_change = 0 AND p.completed_at IS NOT NULL`).bind(userId).first())
}

export interface AgentIdentity { grantId: string; user: PortalUser }
export async function agentFromRequest(request: Request, env: CanvasEnv): Promise<AgentIdentity | null> {
	const token = /^Bearer (xpa_[a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1]
	if (!token) return null
	const row = await portalDb(env).prepare(`SELECT g.id AS grant_id, g.last_used_at, u.id, u.username, u.name FROM agent_grants g
		JOIN users u ON u.id = g.user_id JOIN student_passes p ON p.user_id = u.id
		WHERE g.access_hash = ? AND g.access_expires_at > ? AND u.role = 'student' AND u.disabled = 0 AND u.must_change = 0 AND p.completed_at IS NOT NULL`)
		.bind(await hashToken(token), Date.now()).first<{ grant_id: string; last_used_at: number | null; id: string; username: string; name: string }>()
	if (!row) return null
	if (!row.last_used_at || Date.now() - row.last_used_at > 5 * 60 * 1000) await portalDb(env).prepare('UPDATE agent_grants SET last_used_at = ? WHERE id = ?').bind(Date.now(), row.grant_id).run()
	return { grantId: row.grant_id, user: { id: row.id, username: row.username, name: row.name, role: 'student', mustChangePassword: false } }
}
export async function agentRateLimited(env: CanvasEnv, grantId: string) {
	return rateLimited(env, `mcp:${grantId}`, 600)
}

export interface AgentGrant { id: string; client: string; createdAt: number; lastUsedAt: number | null }
export async function listAgentGrants(env: CanvasEnv, userId: string): Promise<AgentGrant[]> {
	const { results } = await portalDb(env).prepare('SELECT id, client_name, created_at, last_used_at FROM agent_grants WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all<{ id: string; client_name: string; created_at: number; last_used_at: number | null }>()
	return results.map((row) => ({ id: row.id, client: row.client_name, createdAt: row.created_at, lastUsedAt: row.last_used_at }))
}
export async function revokeAgentGrants(env: CanvasEnv, userId: string, grantId?: string) {
	const db = portalDb(env)
	await (grantId ? db.prepare('DELETE FROM agent_grants WHERE user_id = ? AND id = ?').bind(userId, grantId) : db.prepare('DELETE FROM agent_grants WHERE user_id = ?').bind(userId)).run()
}
