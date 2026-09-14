import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Creates fixtures. Run only against an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const first = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	const second = await browser.newContext({ baseURL })
	for (const context of [first, second]) {
		const response = await context.request.get('/api/editor-session')
		assert.deepEqual(await response.json(), { role: 'editor', authRequired: false })
		assert.equal(response.headers()['set-cookie'], undefined)
		assert.equal((await context.request.get('/api/library')).status(), 200)
		assert.equal((await context.request.get('/api/resources')).status(), 200)
	}
	const manager = await first.newPage(), errors = []
	manager.on('pageerror', error => errors.push(error.message))
	await manager.goto('/'); await manager.getByTestId('board-manager').waitFor()
	assert.equal(await manager.getByRole('button', { name: 'Editar', exact: true }).count(), 0)
	assert.equal(await manager.getByRole('button', { name: 'Opciones del administrador' }).count(), 0)
	const created = manager.waitForResponse(r => r.url().endsWith('/api/boards') && r.request().method() === 'POST')
	await manager.getByRole('button', { name: 'Nuevo canvas', exact: true }).tap()
	const boardResponse = await created; assert.equal(boardResponse.status(), 201)
	const board = await boardResponse.json(), peer = await second.newPage()
	peer.on('pageerror', error => errors.push(error.message))
	await peer.goto(`/board/${board.id}`)
	for (const page of [manager, peer]) {
		await page.waitForFunction(() => !!window.__xpCanvasEditor)
		assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getInstanceState().isReadonly), false)
		assert.equal(await page.getByTestId('editor-menu.trigger').count(), 0)
		assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0)
	}
	await manager.evaluate(() => { window.__xpCanvasEditor.createShape({ id: 'shape:open-access', type: 'geo', x: 200, y: 200 }) })
	await peer.waitForFunction(() => !!window.__xpCanvasEditor.getShape('shape:open-access'))
	await peer.evaluate(() => { window.__xpCanvasEditor.updateShape({ id: 'shape:open-access', type: 'geo', props: { color: 'blue' } }) })
	await manager.waitForFunction(() => window.__xpCanvasEditor.getShape('shape:open-access')?.props.color === 'blue')
	await manager.reload(); await manager.waitForFunction(() => window.__xpCanvasEditor?.getShape('shape:open-access')?.props.color === 'blue')
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
	const uploadId = randomUUID()
	assert.equal((await second.request.post(`/api/uploads/${uploadId}`, { data: png, headers: { 'content-type': 'image/png', 'x-file-name': 'open.png', 'x-save-resource': 'true' } })).status(), 201)
	assert.deepEqual(await (await first.request.get(`/api/uploads/${uploadId}`)).body(), png)
	assert.equal((await first.request.post(`/api/boards/${board.id}/copy`)).status(), 201)
	assert.equal((await second.request.patch(`/api/boards/${board.id}`, { data: { trashed: true } })).status(), 200)
	assert.equal((await second.request.patch(`/api/boards/${board.id}`, { data: { trashed: false } })).status(), 200)
	assert.equal((await second.request.delete(`/api/resources/${uploadId}`)).status(), 204)
	assert.equal((await second.request.post('/api/editor-session/logout')).status(), 200)
	assert.deepEqual(await (await second.request.get('/api/editor-session')).json(), { role: 'editor', authRequired: false })
	const hostile = { origin: 'https://untrusted.test' }
	for (const path of ['/api/boards', `/api/boards/${board.id}/copy`, '/api/editor-session', '/api/editor-session/logout', `/api/uploads/${randomUUID()}`]) {
		assert.equal((await first.request.post(path, { headers: hostile, data: {} })).status(), 403, path)
	}
	assert.equal((await first.request.get(`/api/connect/${board.id}?sessionId=abcdefghijklmnop`, { headers: { ...hostile, upgrade: 'websocket' } })).status(), 403)
	for (const context of [first, second]) assert.equal((await context.cookies()).length, 0)
	assert.deepEqual(errors, [])
	console.log('Open editing passed: no password or cookies, iPad manager, two-way editing, persistence, upload, resources, copy, trash/restore, logout and cross-origin rejection.')
} finally { await browser.close() }
