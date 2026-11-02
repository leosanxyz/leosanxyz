import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'

// Writes synthetic accounts, canvases and agent grants. Only run on the isolated portal QA server.
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Only use isolated localhost state.')
const teacherPassword = process.env.PORTAL_QA_PASSWORD ?? 'qa-teacher-password-only-local'

function client() {
	let cookie = ''
	const call = async (path, method = 'GET', data, extra = {}) => {
		const response = await fetch(`${base}${path}`, { method, redirect: 'manual', headers: { origin: base, cookie, ...(data ? { 'content-type': 'application/json' } : {}), ...extra }, ...(data ? { body: JSON.stringify(data) } : {}) })
		if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
		const text = await response.text()
		let body = null
		try { body = JSON.parse(text) } catch { body = text }
		return { status: response.status, data: body, headers: response.headers }
	}
	call.cookie = () => cookie
	return call
}
const teacher = client(), ana = client(), luis = client()
const stamp = randomUUID().slice(0, 8).toUpperCase(), password = 'test-passphrase-only-local'
const users = { ana: `MCPA${stamp}`, luis: `MCPB${stamp}` }

// --- Accounts -----------------------------------------------------------------------------------
assert.equal((await teacher('/api/portal/login', 'POST', { username: 'leo', password: teacherPassword })).status, 200)
assert.equal((await teacher('/api/portal/students', 'POST', { students: [{ username: users.ana, name: 'Ana MCP' }, { username: users.luis, name: 'Luis MCP' }] })).status, 201)
for (const [call, username] of [[ana, users.ana], [luis, users.luis]]) {
	assert.equal((await call('/api/portal/login', 'POST', { username, password: username })).status, 200)
	assert.equal((await call('/api/portal/password', 'POST', { password })).status, 200)
	const pass = await call('/api/portal/pass')
	assert.equal((await call('/api/portal/pass', 'PUT', { draft: pass.data.draft, revision: pass.data.revision, completed: true })).status, 200)
}
const roster = await teacher('/api/portal/roster')
const anaId = roster.data.students.find((student) => student.username === users.ana).id

// A class canvas shared with Ana stays read-only for her and for her agent.
const classBoard = (await teacher('/api/boards', 'POST', { name: `Clase MCP ${stamp}` })).data
assert.equal((await teacher(`/api/portal/boards/${classBoard.id}/access`, 'PUT', { grants: [{ kind: 'user', subjectId: anaId }] })).status, 200)

// --- OAuth ---------------------------------------------------------------------------------------
const anonymousMcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) })
assert.equal(anonymousMcp.status, 401)
const challenge = anonymousMcp.headers.get('www-authenticate')
assert.match(challenge, /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/)
const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()
assert.equal(resource.resource, `${base}/mcp`)
const metadata = await (await fetch(`${resource.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json()
assert.deepEqual(metadata.code_challenge_methods_supported, ['S256'])
assert.equal(new URL(metadata.authorization_endpoint).pathname, '/autorizar')

const register = (redirect_uris) => fetch(metadata.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Codex', redirect_uris, token_endpoint_auth_method: 'none' }) })
assert.equal((await register(['http://evil.test/callback'])).status, 400)
const registered = await (await register(['http://127.0.0.1:1455/callback'])).json()
assert.ok(registered.client_id)

const verifier = randomBytes(32).toString('base64url')
const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
const redirect = 'http://127.0.0.1:48123/callback'
const authorizeParams = { client_id: registered.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: codeChallenge, code_challenge_method: 'S256', state: 'estado-123', resource: `${base}/mcp` }
const query = new URLSearchParams(authorizeParams)
assert.equal((await client()('/api/oauth/authorize?' + query)).status, 401)
assert.equal((await teacher('/api/oauth/authorize?' + query)).status, 403)
assert.equal((await ana('/api/oauth/authorize?' + new URLSearchParams({ ...authorizeParams, redirect_uri: 'http://127.0.0.1:1455/otra' }))).status, 400)
assert.equal((await ana('/api/oauth/authorize?' + new URLSearchParams({ ...authorizeParams, code_challenge_method: 'plain' }))).status, 400)
assert.deepEqual((await ana('/api/oauth/authorize?' + query)).data, { client: 'Codex' })
const web = await (await register(['https://chat.example.test/callback'])).json()
assert.deepEqual((await ana('/api/oauth/authorize?' + new URLSearchParams({ ...authorizeParams, client_id: web.client_id, redirect_uri: 'https://chat.example.test/callback' }))).data, { client: 'Codex', returnsTo: 'chat.example.test' })
assert.equal((await ana('/api/oauth/authorize', 'POST', { ...authorizeParams, approve: true }, { origin: 'https://hostile.test' })).status, 403)
const denied = new URL((await ana('/api/oauth/authorize', 'POST', { ...authorizeParams, approve: false })).data.redirect)
assert.equal(denied.searchParams.get('error'), 'access_denied')
assert.equal(denied.searchParams.get('state'), 'estado-123')

async function authorize(call = ana) {
	const back = new URL((await call('/api/oauth/authorize', 'POST', { ...authorizeParams, approve: true })).data.redirect)
	assert.equal(back.origin + back.pathname, redirect)
	assert.equal(back.searchParams.get('state'), 'estado-123')
	return back.searchParams.get('code')
}
const token = (data) => fetch(metadata.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) })
let code = await authorize()
assert.equal((await token({ grant_type: 'authorization_code', code, code_verifier: randomBytes(32).toString('base64url'), client_id: registered.client_id, redirect_uri: redirect })).status, 400)
// A failed exchange burns the code too.
assert.equal((await token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.client_id, redirect_uri: redirect })).status, 400)
code = await authorize()
const tokens = await (await token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.client_id, redirect_uri: redirect })).json()
assert.equal(tokens.token_type, 'Bearer')
assert.equal((await token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.client_id, redirect_uri: redirect })).status, 400)

// --- MCP -----------------------------------------------------------------------------------------
let id = 0
async function mcp(accessToken, method, params = {}) {
	const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
	return { status: response.status, body: response.status === 200 ? await response.json() : await response.text() }
}
const tool = async (name, args, accessToken = tokens.access_token) => (await mcp(accessToken, 'tools/call', { name, arguments: args })).body.result

const init = await mcp(tokens.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } })
assert.equal(init.body.result.protocolVersion, '2025-06-18')
assert.match(init.body.result.instructions, /exactamente lo que el alumno dictó/)
assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status, 202)
assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hostile.test', authorization: `Bearer ${tokens.access_token}` }, body: '{}' })).status, 403)
const toolNames = (await mcp(tokens.access_token, 'tools/list')).body.result.tools.map((entry) => entry.name)
assert.deepEqual(toolNames, ['listar_canvases', 'crear_canvas', 'dibujar_diagrama', 'leer_canvas'])
// MCP Apps: the drawing tools point to a ui:// view that hosts with UI render in the chat.
const tools = (await mcp(tokens.access_token, 'tools/list')).body.result.tools
assert.equal(tools.find((entry) => entry.name === 'dibujar_diagrama')._meta.ui.resourceUri, 'ui://xp-canvas/diagrama.html')
const view = (await mcp(tokens.access_token, 'resources/read', { uri: 'ui://xp-canvas/diagrama.html' })).body.result.contents[0]
assert.equal(view.mimeType, 'text/html;profile=mcp-app')
assert.match(view.text, /ui\/notifications\/tool-result/)

assert.deepEqual((await tool('listar_canvases', {})).structuredContent.canvases, [])
const created = (await tool('crear_canvas', { nombre: 'Mi mod de zombies' })).structuredContent.canvas
assert.equal(created.enlace, `${base}/board/${created.id}`)

const chart = {
	canvas: created.id,
	titulo: 'Cuando un zombie me pega',
	nodos: [
		{ id: 'inicio', tipo: 'inicio', texto: 'Un zombie me pega' },
		{ id: 'restar', tipo: 'proceso', texto: 'Restar una vida' },
		{ id: 'quedan', tipo: 'decision', texto: '¿Me quedan vidas?' },
		{ id: 'seguir', tipo: 'proceso', texto: 'Seguir jugando' },
		{ id: 'perder', tipo: 'proceso', texto: 'Mostrar «Perdiste»' },
	],
	flechas: [{ de: 'inicio', a: 'restar' }, { de: 'restar', a: 'quedan' }, { de: 'quedan', a: 'seguir', etiqueta: 'SÍ' }],
}
const drawn = await tool('dibujar_diagrama', chart)
assert.ok(!drawn.isError, drawn.content?.[0]?.text)
assert.deepEqual(drawn.structuredContent.huecos.map((gap) => gap.tipo).sort(), ['decision-sin-no', 'inalcanzable', 'sin-fin', 'sin-salida', 'sin-salida'].sort())
assert.match(drawn.content[0].text, /uno por uno/)
assert.match(drawn._meta['xp-canvas/svg'], /^<svg/)
// The library card shows the diagram before anyone opens the canvas.
const thumbnail = await fetch(`${base}/api/boards/${created.id}/thumbnail`, { headers: { cookie: ana.cookie() } })
assert.equal(thumbnail.headers.get('content-type'), 'image/svg+xml')
assert.match(thumbnail.headers.get('content-security-policy'), /default-src 'none'/)

const complete = { ...chart, nodos: [...chart.nodos, { id: 'fin', tipo: 'fin', texto: 'Fin del juego' }], flechas: [...chart.flechas, { de: 'quedan', a: 'perder', etiqueta: 'NO' }, { de: 'seguir', a: 'restar' }, { de: 'perder', a: 'fin' }] }
const updated = await tool('dibujar_diagrama', { ...complete, canvas: 'Mi mod de zombies' })
assert.equal(updated.structuredContent.creado, false)
assert.deepEqual(updated.structuredContent.huecos, [])
const read = (await tool('leer_canvas', { canvas: created.enlace })).structuredContent.diagramas
assert.equal(read.length, 1)
assert.deepEqual(read[0].nodos.map((node) => node.id).sort(), complete.nodos.map((node) => node.id).sort())
assert.equal(read[0].flechas.length, complete.flechas.length)

// Invalid input comes back as a tool error the agent can fix, not a crash.
const invalid = await tool('dibujar_diagrama', { ...chart, flechas: [{ de: 'inicio', a: 'nadie' }] })
assert.equal(invalid.isError, true)
assert.match(invalid.content[0].text, /no existe/)

// Class canvases and missing ones look the same to the agent.
for (const canvas of [classBoard.id, 'principal', randomUUID()]) {
	assert.equal((await tool('dibujar_diagrama', { ...chart, canvas })).isError, true, canvas)
	assert.equal((await tool('leer_canvas', { canvas })).isError, true, canvas)
}

// --- Portal access ----------------------------------------------------------------------------------
const anaLibrary = (await ana('/api/library')).data.boards
assert.deepEqual(anaLibrary.map((board) => board.id).sort(), [classBoard.id, created.id].sort())
assert.equal(anaLibrary.find((board) => board.id === created.id).ownerId, anaId)
assert.equal((await luis(`/api/boards/${created.id}`)).status, 404)
assert.equal((await luis(`/api/library`)).data.boards.length, 0)
assert.equal((await ana(`/api/boards/${created.id}`)).status, 200)
assert.ok(!(await teacher('/api/library')).data.boards.some((board) => board.id === created.id), 'Personal canvases stay out of the teacher library')
assert.ok((await teacher('/api/portal/roster')).data.canvases.some((board) => board.id === created.id && board.ownerId === anaId))
assert.equal((await teacher(`/api/boards/${created.id}`)).status, 200)
const own = (await ana('/api/portal/canvases', 'POST', { name: 'Desde el portal' }))
assert.equal(own.status, 201)
assert.equal(own.data.ownerId, anaId)
assert.equal((await teacher('/api/portal/canvases', 'POST', { name: 'No' })).status, 404)
assert.equal((await ana('/api/boards', 'POST', { name: 'No' })).status, 403, 'Students cannot create class canvases')
assert.equal((await ana(`/api/boards/${created.id}`, 'PATCH', { name: 'No' })).status, 403)
// Class activities with points or cards are refused in personal canvases.
assert.equal((await ana(`/api/boards/${created.id}/interactions`, 'POST', { action: 'gachapon', shapeId: 'shape:x', revision: 'r1', cost: 0 })).status, 403)
assert.equal((await ana(`/api/boards/${created.id}/interactions`)).status, 200)

// --- Owner edits over the WebSocket; class canvases stay read-only --------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const context = await browser.newContext({ baseURL: base })
	await context.addCookies([{ name: 'xp_portal', value: ana.cookie().split('=')[1], url: base }])
	const page = await context.newPage()
	const editor = async (boardId) => {
		await page.goto(`/board/${boardId}`)
		await page.waitForFunction(() => window.__xpCanvasEditor?.getCurrentPageShapes().length >= 0 && document.querySelector('.tl-container'))
		await page.waitForTimeout(1200)
	}
	await editor(created.id)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getInstanceState().isReadonly), false)
	assert.ok(await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().some((shape) => shape.type === 'frame' && shape.props.name === 'Cuando un zombie me pega')))
	await page.evaluate(() => { window.__xpCanvasEditor.createShape({ type: 'text', x: -400, y: -200, props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nota de Ana' }] }] } } }) })
	await page.waitForTimeout(1200)
	await editor(created.id)
	assert.ok(await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().some((shape) => shape.type === 'text')), 'The owner write was saved')
	// Hand edits show up when the agent reads the canvas.
	const after = (await tool('leer_canvas', { canvas: created.id })).structuredContent.diagramas
	assert.ok(after.some((diagram) => !diagram.enMarco && diagram.otros.includes('Texto: «nota de Ana».')))
	await editor(classBoard.id)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getInstanceState().isReadonly), true)
} finally { await browser.close() }

// --- Refresh and revocation -------------------------------------------------------------------------
const refreshed = await (await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: registered.client_id })).json()
assert.ok(refreshed.access_token && refreshed.access_token !== tokens.access_token)
assert.equal((await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: registered.client_id })).status, 400, 'Refresh tokens rotate')
assert.equal((await mcp(tokens.access_token, 'tools/list')).status, 401, 'The previous access token stops working')
assert.equal((await mcp(refreshed.access_token, 'tools/list')).status, 200)
const agents = (await ana('/api/portal/agents')).data.agents
assert.equal(agents.length, 1)
assert.equal(agents[0].client, 'Codex')
assert.equal((await teacher(`/api/portal/students/${anaId}/agents`)).data.agents.length, 1)
assert.equal((await teacher(`/api/portal/students/${anaId}/agents`, 'DELETE')).status, 200)
assert.equal((await mcp(refreshed.access_token, 'tools/list')).status, 401, 'Teacher revocation is immediate')
// A student can disconnect their own agent, and a password reset disconnects every agent.
code = await authorize()
const second = await (await token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.client_id, redirect_uri: redirect })).json()
const [grant] = (await ana('/api/portal/agents')).data.agents
assert.equal((await ana(`/api/portal/agents/${grant.id}`, 'DELETE')).status, 200)
assert.equal((await mcp(second.access_token, 'tools/list')).status, 401)
code = await authorize()
const third = await (await token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.client_id, redirect_uri: redirect })).json()
assert.equal((await teacher(`/api/portal/students/${anaId}/reset`, 'POST')).status, 200)
assert.equal((await mcp(third.access_token, 'tools/list')).status, 401)
assert.equal((await token({ grant_type: 'refresh_token', refresh_token: third.refresh_token, client_id: registered.client_id })).status, 400)

console.log('PASS: OAuth discovery, registration, PKCE, single-use codes, consent, MCP tools, gaps, personal canvas isolation, owner writes, class read-only, refresh rotation and revocation.')
