import type { CanvasEnv } from './access'
import { isSameOrigin } from './access'
import { catalog, readBoard } from './boards'
import type { BoardLibrary } from '../shared/boards'
import { studentLibrary } from './studentLibrary'
import { isBoardId } from '../shared/boards'
import type { BoardGrant, Student } from '../shared/portal'
import { validPass } from '../shared/pass'
import { readPass } from './studentPass'
import {
	allowedBoardIds, canReadBoard, clearPortalCookie, constantMatch, createPortalSession,
	getPortalSession, hashPassword, loginAllowed, normalizeUsername, passwordProblem,
	portalDb, portalEnabled, publicUser, TEACHER_ID, validUsername, verifyPassword,
	type AuthSession, type UserRow,
} from './portalAuth'

class PortalError extends Error { constructor(readonly status: number, message: string) { super(message) } }
const json = (data: unknown, status = 200, cookie?: string) => Response.json(data, {
	status, headers: { 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) },
})
async function body(request: Request, limit = 4096): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PortalError(415, 'Envía una solicitud JSON.')
	if (Number(request.headers.get('content-length')) > limit) throw new PortalError(413, 'Solicitud demasiado grande.')
	const reader = request.body?.getReader()
	if (!reader) throw new PortalError(400, 'Solicitud inválida.')
	const decoder = new TextDecoder(), chunks: string[] = []
	let length = 0
	while (true) {
		const { value, done } = await reader.read()
		if (done) break
		length += value.byteLength
		if (length > limit) { await reader.cancel(); throw new PortalError(413, 'Solicitud demasiado grande.') }
		chunks.push(decoder.decode(value, { stream: true }))
	}
	const text = chunks.join('') + decoder.decode()
	try {
		const result = JSON.parse(text)
		if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
		return result
	} catch { throw new PortalError(400, 'Solicitud inválida.') }
}
function name(value: unknown) {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f]/.test(value)) throw new PortalError(400, 'Escribe un nombre de hasta 120 caracteres.')
	return value.trim()
}
async function library(env: CanvasEnv) { return (await catalog(env).fetch('http://catalog/api/library')).json<BoardLibrary>() }
async function recheckRooms(env: CanvasEnv) {
	// Only used for account/session revocation, not on every canvas message.
	const { boards } = await library(env)
	await Promise.all(boards.map((board) => env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(board.id)).revalidatePortalSessions()))
}
async function groupId(value: unknown, env: CanvasEnv): Promise<string | null> {
	if (value == null || value === '') return null
	if (typeof value !== 'string' || !await portalDb(env).prepare('SELECT id FROM student_groups WHERE id = ?').bind(value).first()) throw new PortalError(400, 'El grupo no existe.')
	return value
}
async function readStudent(id: string, env: CanvasEnv) {
	const student = await portalDb(env).prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").bind(id).first<UserRow>()
	if (!student) throw new PortalError(404, 'El alumno no existe.')
	return student
}

export async function handlePortalRequest(request: Request, env: CanvasEnv): Promise<Response> {
	try {
		const path = new URL(request.url).pathname, method = request.method
		if (path === '/api/portal/session' && method === 'GET') {
			return json({ mode: portalEnabled(env) ? 'portal' : 'local', user: portalEnabled(env) ? (await getPortalSession(request, env))?.user ?? null : null })
		}
		if (!portalEnabled(env)) return json({ error: 'El portal no está habilitado.' }, 404)
		if (method !== 'GET' && !isSameOrigin(request)) return json({ error: 'Origen inválido.' }, 403)
		const db = portalDb(env)
		if (path === '/api/portal/login' && method === 'POST') {
			const data = await body(request), username = normalizeUsername(data.username)
			if (!validUsername(username) || typeof data.password !== 'string' || data.password.length > 128) throw new PortalError(401, 'Usuario o contraseña incorrectos.')
			if (!await loginAllowed(request, username, env)) return new Response(JSON.stringify({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' }), { status: 429, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '900' } })
			let user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>()
			// Bootstrap is a teacher-only secret. It cannot upgrade a student account or
			// reset an existing teacher password. Remove the secret after first login.
			if (!user && username === normalizeUsername(env.PORTAL_ADMIN_USERNAME ?? 'leo') &&
				(env.PORTAL_BOOTSTRAP_PASSWORD?.length ?? 0) >= 15 && await constantMatch(data.password, env.PORTAL_BOOTSTRAP_PASSWORD!)) {
				const passwordHash = await hashPassword(data.password, env)
				await db.prepare("INSERT OR IGNORE INTO users (id, username, name, role, password_hash, must_change, created_at) VALUES (?, ?, 'Leo', 'teacher', ?, 0, ?)")
					.bind(TEACHER_ID, username, passwordHash, Date.now()).run()
				user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>()
			}
			const passwordMatches = await verifyPassword(data.password, user?.password_hash ?? null, env)
			const initialMatches = user?.role === 'student' && user.must_change === 1 && user.password_hash === null && await constantMatch(normalizeUsername(data.password), user.username)
			if (!user || user.disabled || !(passwordMatches || initialMatches)) throw new PortalError(401, 'Usuario o contraseña incorrectos.')
			// Bounded cleanup; no plaintext passwords or session tokens are logged/stored.
			await db.batch([
				db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
				db.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(Date.now() - 24 * 60 * 60 * 1000),
			])
			return json({ user: publicUser(user) }, 200, await createPortalSession(request, user, env))
		}
		const session = await getPortalSession(request, env)
		if (path === '/api/portal/logout' && method === 'POST') {
			if (session) {
				await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run()
				await recheckRooms(env)
			}
			return json({ user: null }, 200, clearPortalCookie(request))
		}
		if (!session) throw new PortalError(401, 'Inicia sesión para continuar.')
		if (path === '/api/portal/password' && method === 'POST') {
			const data = await body(request), problem = passwordProblem(data.password, session.user.username)
			if (problem) throw new PortalError(400, problem)
			if (!await loginAllowed(request, session.user.username, env)) throw new PortalError(429, 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.')
			const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user.id).first<UserRow>()
			if (!user || user.version !== session.version || user.disabled) throw new PortalError(401, 'Vuelve a iniciar sesión.')
			if (!user.must_change && (typeof data.currentPassword !== 'string' || data.currentPassword.length > 128 || !await verifyPassword(data.currentPassword, user.password_hash, env))) throw new PortalError(401, 'La contraseña actual no es correcta.')
			const passwordHash = await hashPassword(data.password as string, env)
			const updated = await db.prepare('UPDATE users SET password_hash = ?, must_change = 0, version = version + 1 WHERE id = ? AND version = ? RETURNING *')
				.bind(passwordHash, user.id, user.version).first<UserRow>()
			if (!updated) throw new PortalError(409, 'La cuenta cambió. Vuelve a iniciar sesión.')
			await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run()
			await recheckRooms(env)
			return json({ user: publicUser(updated) }, 200, await createPortalSession(request, updated, env))
		}
		if (session.user.mustChangePassword) throw new PortalError(403, 'Cambia tu contraseña antes de continuar.')
		if (path === '/api/portal/pass' && session.user.role === 'student') {
			if (method === 'GET') return json(await readPass(session.user, env))
			if (method === 'PUT') {
				const data = await body(request, 32_000)
				if (!validPass(data.draft) || !Number.isInteger(data.revision) || typeof data.completed !== 'boolean') throw new PortalError(400, 'Revisa el nombre y el diseño de tu pase.')
				await db.prepare('INSERT OR IGNORE INTO student_passes (user_id) VALUES (?)').bind(session.user.id).run()
				const result = await db.prepare('UPDATE student_passes SET draft_json = ?, completed_at = COALESCE(completed_at, ?), revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision')
					.bind(JSON.stringify(data.draft), data.completed ? Date.now() : null, Date.now(), session.user.id, data.revision).first()
				if (!result) throw new PortalError(409, 'Tu pase cambió en otra pestaña. Recarga para recuperar la versión guardada.')
				return json(await readPass(session.user, env))
			}
		}
		if (session.user.role !== 'teacher') throw new PortalError(403, 'Solo el profesor puede administrar el portal.')
		if (import.meta.env.DEV && path === '/api/portal/review-passes' && method === 'GET') {
			const { results } = await db.prepare("SELECT * FROM users WHERE role = 'student' AND group_id = 'pipelines-sd26' ORDER BY name").all<UserRow>()
			return json({ students: await Promise.all(results.map(async (row) => ({ username: row.username, name: row.name, profile: await readPass(publicUser(row), env) }))) })
		}
		if (path === '/api/portal/roster' && method === 'GET') {
			const [students, groups] = await Promise.all([
				db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY name").all<UserRow>(),
				db.prepare('SELECT id, name FROM student_groups ORDER BY name').all(),
			])
			return json({ students: students.results.map((row): Student => ({ ...publicUser(row), groupId: row.group_id, disabled: Boolean(row.disabled) })), groups: groups.results })
		}
		if (path === '/api/portal/groups' && method === 'POST') {
			const group = { id: crypto.randomUUID(), name: name((await body(request)).name) }
			if (await db.prepare('SELECT id FROM student_groups WHERE name = ?').bind(group.name).first()) throw new PortalError(409, 'Ese grupo ya existe.')
			await db.prepare('INSERT INTO student_groups (id, name) VALUES (?, ?)').bind(group.id, group.name).run()
			return json(group, 201)
		}
		if (path === '/api/portal/students' && method === 'POST') {
			const data = await body(request, 32_000)
			if (!Array.isArray(data.students) || !data.students.length || data.students.length > 100) throw new PortalError(400, 'Añade entre 1 y 100 alumnos a la vez.')
			const group = await groupId(data.groupId, env), seen = new Set<string>()
			const rows = data.students.map((value) => {
				if (!value || typeof value !== 'object') throw new PortalError(400, 'Alumno inválido.')
				const username = normalizeUsername(value.username)
				if (!validUsername(username) || seen.has(username) || username === normalizeUsername(env.PORTAL_ADMIN_USERNAME ?? 'leo')) throw new PortalError(400, 'Revisa las matrículas. No pueden repetirse ni usar el usuario del profesor.')
				seen.add(username)
				return { id: crypto.randomUUID(), username, name: name(value.name) }
			})
			const existing = await db.prepare(`SELECT username FROM users WHERE username IN (${rows.map(() => '?').join(',')})`).bind(...rows.map((row) => row.username)).all<{ username: string }>()
			if (existing.results.length) throw new PortalError(409, `Ya existen estas matrículas: ${existing.results.map((row) => row.username).join(', ')}. No se modificó ninguna cuenta.`)
			await db.batch(rows.map((row) => db.prepare("INSERT INTO users (id, username, name, role, group_id, created_at) VALUES (?, ?, ?, 'student', ?, ?)").bind(row.id, row.username, row.name, group, Date.now())))
			return json({ created: rows.length }, 201)
		}
		const studentMatch = /^\/api\/portal\/students\/([a-f0-9-]+)(\/reset)?$/.exec(path)
		if (studentMatch && (method === 'PATCH' || method === 'POST' && studentMatch[2])) {
			const student = await readStudent(studentMatch[1], env)
			if (studentMatch[2]) {
				await db.prepare('UPDATE users SET password_hash = NULL, must_change = 1, version = version + 1 WHERE id = ?').bind(student.id).run()
			} else {
				const data = await body(request)
				if ('disabled' in data && typeof data.disabled !== 'boolean') throw new PortalError(400, 'Estado inválido.')
				const group = 'groupId' in data ? await groupId(data.groupId, env) : student.group_id
				await db.prepare('UPDATE users SET name = ?, group_id = ?, disabled = ?, version = version + 1 WHERE id = ?')
					.bind('name' in data ? name(data.name) : student.name, group, 'disabled' in data ? Number(data.disabled) : student.disabled, student.id).run()
			}
			await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(student.id).run()
			await recheckRooms(env)
			return json({ ok: true })
		}
		const grantMatch = /^\/api\/portal\/boards\/([^/]+)\/access$/.exec(path)
		if (grantMatch && (method === 'GET' || method === 'PUT')) {
			const boardId = grantMatch[1], board = await readBoard(env, boardId)
			if (!board || board.trashedAt) throw new PortalError(404, 'Este canvas no está disponible.')
			if (method === 'GET') {
				const { results } = await db.prepare('SELECT kind, subject_id AS subjectId FROM board_grants WHERE board_id = ?').bind(boardId).all<BoardGrant>()
				return json({ grants: results })
			}
			const data = await body(request, 32_000)
			if (!Array.isArray(data.grants) || data.grants.length > 100) throw new PortalError(400, 'Permisos inválidos. Usa grupos para compartir con más de 100 alumnos.')
			const grants: BoardGrant[] = [], seen = new Set<string>()
			for (const value of data.grants) {
				if (!value || !['user', 'group'].includes(value.kind) || typeof value.subjectId !== 'string') throw new PortalError(400, 'Permiso inválido.')
				const key = `${value.kind}:${value.subjectId}`
				if (seen.has(key)) continue
				seen.add(key)
				const query = value.kind === 'user' ? "SELECT id FROM users WHERE id = ? AND role = 'student'" : 'SELECT id FROM student_groups WHERE id = ?'
				if (!await db.prepare(query).bind(value.subjectId).first()) throw new PortalError(400, 'El alumno o grupo ya no existe.')
				grants.push({ kind: value.kind, subjectId: value.subjectId })
			}
			await db.batch([
				db.prepare('DELETE FROM board_grants WHERE board_id = ?').bind(boardId),
				...grants.map((grant) => db.prepare('INSERT INTO board_grants (board_id, kind, subject_id) VALUES (?, ?, ?)').bind(boardId, grant.kind, grant.subjectId)),
			])
			await env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(boardId)).revalidatePortalSessions()
			return json({ grants })
		}
		return json({ error: 'No encontrado.' }, 404)
	} catch (cause) {
		if (cause instanceof PortalError) return json({ error: cause.message }, cause.status)
		console.error('Portal request failed', cause instanceof Error ? cause.message : 'Unknown error')
		return json({ error: 'No se pudo completar la solicitud. Inténtalo de nuevo.' }, 503)
	}
}

async function canReadAsset(request: Request, uploadId: string, session: AuthSession, env: CanvasEnv) {
	const allowed = await allowedBoardIds(session, env)
	const url = new URL(request.url)
	let hint = url.searchParams.get('boardId')
	if (!hint) {
		try { hint = /^\/board\/([^/]+)/.exec(new URL(request.headers.get('referer') ?? '').pathname)?.[1] ?? null } catch { /* Direct download: inspect granted rooms. */ }
	}
	const candidates = hint ? allowed.has(hint) ? [hint] : [] : [...allowed]
	for (const id of candidates) {
		const board = await readBoard(env, id)
		if (!board || board.trashedAt) continue
		if (await env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(id)).referencesAsset(uploadId)) return true
	}
	return false
}

/** Deny by default. The old local editor code is never an alternative login in portal mode. */
export async function portalGate(request: Request, env: CanvasEnv): Promise<Response | undefined> {
	if (!portalEnabled(env)) return undefined
	const url = new URL(request.url), path = url.pathname
	if (!path.startsWith('/api/') || path === '/api/health' || path.startsWith('/api/portal/')) return undefined
	if (!['GET', 'HEAD'].includes(request.method) && !isSameOrigin(request)) return json({ error: 'Origen inválido.' }, 403)
	const session = await getPortalSession(request, env)
	if (!session) return json({ error: 'Inicia sesión para continuar.' }, 401)
	if (session.user.mustChangePassword) return json({ error: 'Cambia tu contraseña antes de continuar.' }, 403)
	if (path.startsWith('/api/editor-session') && (path !== '/api/editor-session' || request.method !== 'GET')) return json({ error: 'Usa el acceso del portal.' }, 403)
	if (session.user.role === 'teacher') return undefined
	if (!session.passCompleted) return json({ error: 'Termina tu bienvenida antes de entrar a tus clases.' }, 403)
	const interaction = /^\/api\/boards\/([^/]+)\/interactions$/.exec(path)
	if (interaction && ['GET', 'POST'].includes(request.method) && isBoardId(interaction[1]) && await canReadBoard(session, interaction[1], env)) return undefined
	if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Tu cuenta solo puede observar canvases.' }, 403)
	if (path === '/api/editor-session') return undefined
	if (path === '/api/library') {
		const [data, allowed] = await Promise.all([library(env), allowedBoardIds(session, env)])
		return json(studentLibrary(data, allowed))
	}
	const board = /^\/api\/(?:boards|connect)\/([^/]+)(?:\/thumbnail)?$/.exec(path)
	if (board && isBoardId(board[1]) && await canReadBoard(session, board[1], env)) return undefined
	const asset = /^\/api\/uploads\/([a-zA-Z0-9_-]{10,100})$/.exec(path)
	if (asset && await canReadAsset(request, asset[1], session, env)) return undefined
	return json({ error: 'Este recurso no está disponible para tu cuenta.' }, 404)
}
