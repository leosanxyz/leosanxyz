import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Deletes test entries only. Run against an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	const viewer = await browser.newContext({ baseURL })
	await context.request.post('/api/editor-session', { data: { code: editorCode } })
	const api = async (path, method = 'GET', data) => {
		const response = await context.request.fetch(`/api/${path}`, { method, ...(data === undefined ? {} : { data }) })
		assert.ok(response.ok(), `${method} ${path}: ${response.status()}`)
		return response.status() === 204 ? null : response.json()
	}
	const run = `delete-${Date.now()}`
	const board = await api('boards', 'POST', { name: run })
	const folder = await api('resource-folders', 'POST', { name: run })
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
	const upload = async (name, bytes, type) => {
		const response = await context.request.post(`/api/uploads/${randomUUID()}`, { data: bytes, headers: { 'content-type': type, 'x-file-name': name, 'x-save-resource': 'true' } })
		assert.equal(response.status(), 201)
		return (await response.json()).resource
	}
	const image = await upload(`${run}.png`, png, 'image/png')
	const document = await upload(`${run}.txt`, Buffer.from('Test resource'), 'text/plain')
	const kept = await upload(`${run}-keep.png`, png, 'image/png')
	await api(`resources/${document.id}`, 'PATCH', { folderId: folder.id })
	assert.equal((await viewer.request.delete(`/api/resources/${image.id}`)).status(), 403)
	assert.equal((await context.request.delete(`/api/resources/${image.id}`, { headers: { origin: 'https://untrusted.test' } })).status(), 403)
	assert.equal((await context.request.delete('/api/resources/invalid')).status(), 400)
	const page = await context.newPage(), reader = await viewer.newPage(), errors = []
	for (const client of [page, reader]) {
		client.setDefaultTimeout(15_000)
		client.on('pageerror', error => errors.push(error.message))
		await client.goto(`/board/${board.id}`)
		await client.waitForFunction(() => !!window.__xpCanvasEditor)
	}
	const open = () => page.getByTestId('ipad-toolbar.resources').tap()
	// The confirmation hides background controls from the accessibility tree.
	const card = resource => page.locator(`[data-resource-id="${resource.id}"]`)
	const options = resource => page.getByRole('button', { name: `Opciones de ${resource.name}`, exact: true }).tap()
	const dialog = page.getByRole('dialog', { name: 'Eliminar de Recursos', exact: true })
	const selectDelete = async resource => {
		await options(resource)
		await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).tap()
		await dialog.waitFor()
		assert.match(await dialog.innerText(), /Las copias que ya están en tus canvases se conservarán/)
	}
	await open(); await card(image).tap()
	const shape = await page.evaluate(() => window.__xpCanvasEditor.getOnlySelectedShape())
	await reader.waitForFunction(id => !!window.__xpCanvasEditor.getShape(id), shape.id)
	await selectDelete(image)
	assert.equal(await dialog.getByRole('button', { name: 'Cancelar', exact: true }).evaluate(el => el === document.activeElement), true)
	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).tap()
	assert.equal(await card(image).count(), 1)
	assert.ok((await api('resources')).resources.some(resource => resource.id === image.id))

	await selectDelete(image)
	await page.route(`**/api/resources/${image.id}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Prueba de error al eliminar.' }) }), { times: 1 })
	await dialog.getByRole('button', { name: 'Eliminar', exact: true }).tap()
	await dialog.getByRole('alert').waitFor()
	assert.equal(await card(image).count(), 1, 'Failure keeps the resource and allows retry')
	const deleted = page.waitForResponse(response => response.url().endsWith(`/api/resources/${image.id}`) && response.request().method() === 'DELETE')
	await dialog.getByRole('button', { name: 'Eliminar', exact: true }).tap()
	assert.equal((await deleted).status(), 204)
	await dialog.waitFor({ state: 'detached' }); await card(image).waitFor({ state: 'detached' })
	assert.equal(await card(kept).count(), 1, 'Other entries remain available')
	assert.equal((await api('resources')).resources.some(resource => resource.id === image.id), false)
	assert.deepEqual(await (await viewer.request.get(image.src)).body(), png, 'The original remains usable by existing canvas shapes')
	assert.deepEqual(await page.evaluate(id => window.__xpCanvasEditor.getShape(id), shape.id), shape)
	assert.deepEqual(await reader.evaluate(id => window.__xpCanvasEditor.getShape(id), shape.id), shape)

	await page.getByRole('button', { name: `Abrir carpeta ${folder.name}`, exact: true }).tap()
	await selectDelete(document)
	await dialog.getByRole('button', { name: 'Eliminar', exact: true }).tap()
	await dialog.waitFor({ state: 'detached' }); await card(document).waitFor({ state: 'detached' })
	await page.reload(); await page.waitForFunction(() => !!window.__xpCanvasEditor)
	await open(); await card(kept).waitFor()
	assert.equal(await card(image).count(), 0, 'Deletion persists after reload')
	await page.getByRole('button', { name: `Abrir carpeta ${folder.name}`, exact: true }).tap()
	assert.equal(await card(document).count(), 0, 'Folder deletion persists without removing the folder')
	assert.equal(await (await viewer.request.get(document.src)).text(), 'Test resource')
	assert.deepEqual(await page.evaluate(id => window.__xpCanvasEditor.getShape(id), shape.id), shape)
	assert.deepEqual(errors, [])
	console.log('Resource deletion passed: confirmation, cancel, failure/retry, root/folder entries, permissions, persistence and existing canvas copies.')
} finally { await browser.close() }
