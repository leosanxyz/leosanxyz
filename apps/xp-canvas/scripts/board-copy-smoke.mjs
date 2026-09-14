import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'
import { editorCode } from './test-config.mjs'

// Creates fixtures only. Use an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	const viewer = await browser.newContext({ baseURL })
	assert.equal((await context.request.post('/api/editor-session', { data: { code: editorCode } })).status(), 201)
	const api = async (path, method = 'GET', data) => {
		const response = await context.request.fetch(`/api/${path}`, { method, ...(data === undefined ? {} : { data }) })
		assert.ok(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`)
		return response.json()
	}
	const run = `copy-${Date.now()}`
	const parent = await api('folders', 'POST', { name: run })
	const folder = await api('folders', 'POST', { name: `${run}-nested`, parentId: parent.id })
	const original = await api('boards', 'POST', { name: run, folderId: folder.id })
	await api(`boards/${original.id}`, 'PATCH', { favorite: true })
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
	const uploadId = randomUUID(), imageSrc = `/api/uploads/${uploadId}`
	assert.equal((await context.request.post(imageSrc, { data: png, headers: { 'content-type': 'image/png', 'x-file-name': 'copy.png', 'x-save-resource': 'true' } })).status(), 201)
	const resourcesBefore = await api('resources')
	const source = await context.newPage(), sourceViewer = await viewer.newPage(), manager = await context.newPage(), copied = await context.newPage()
	const errors = []
	for (const page of [source, sourceViewer, manager, copied]) { page.setDefaultTimeout(15_000); page.on('pageerror', error => errors.push(error.message)) }
	// Hold background thumbnail/timestamp writes while comparing copy side effects.
	// Explicit fixture requests below use context.request and still reach the server.
	await source.route(`**/api/boards/${original.id}**`, route => {
		if (route.request().method() === 'PATCH') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
		if (route.request().method() === 'PUT') return route.fulfill({ status: 204 })
		return route.continue()
	})
	const ready = page => page.waitForFunction(() => !!window.__xpCanvasEditor)
	// Connected users are client-local profiles, not canvas content.
	const documentRecords = page => page.evaluate(() => Object.fromEntries(Object.entries(window.__xpCanvasEditor.store.serialize('document')).filter(([, record]) => record.typeName !== 'user')))
	for (const page of [source, sourceViewer]) { await page.goto(`/board/${original.id}`); await ready(page) }
	await source.evaluate(({ imageSrc, uploadId }) => {
		const e = window.__xpCanvasEditor, first = e.getCurrentPageId()
		e.createPage({ id: 'page:copy-extra', name: 'Segunda página' })
		e.createAssets([{ id: 'asset:copy-image', type: 'image', typeName: 'asset', props: { src: imageSrc, name: 'copy.png', w: 100, h: 100, mimeType: 'image/png', isAnimated: false }, meta: {} }])
		const frame = { x: 0, y: 0, w: 120, h: 80, flipX: false, flipY: false }
		e.createShapes([
			{ id: 'shape:copy-group', type: 'group', x: 200, y: 200 },
			{ id: 'shape:copy-rect', type: 'geo', parentId: 'shape:copy-group', x: 0, y: 0, rotation: .2, props: { w: 120, h: 80 }, meta: { eraseMask: { version: 1, frame, strokes: [{ radius: 8, points: [[30, 0], [30, 80]], frame }] } } },
			{ id: 'shape:copy-image', type: 'image', parentId: 'shape:copy-group', x: 160, y: 0, props: { assetId: 'asset:copy-image', w: 100, h: 100 }, meta: { resourceId: uploadId } },
			{ id: 'shape:copy-arrow', type: 'arrow', x: 250, y: 350 },
			{ id: 'shape:copy-extra', type: 'geo', parentId: 'page:copy-extra', x: 50, y: 50, isLocked: true, props: { geo: 'ellipse', w: 90, h: 90 } },
		])
		e.createBindings([{ id: 'binding:copy-start', type: 'arrow', fromId: 'shape:copy-arrow', toId: 'shape:copy-rect', props: { terminal: 'start', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: true } }])
		e.setCurrentPage(first)
	}, { imageSrc, uploadId })
	await sourceViewer.waitForFunction(() => !!window.__xpCanvasEditor.getShape('shape:copy-extra') && !!window.__xpCanvasEditor.store.get('binding:copy-start'))
	const snapshot = await documentRecords(sourceViewer)
	assert.equal((await context.request.put(`/api/boards/${original.id}/thumbnail`, { data: png, headers: { 'content-type': 'image/png' } })).status(), 204)
	const metadataBefore = await api(`boards/${original.id}`)
	assert.equal((await viewer.request.post(`/api/boards/${original.id}/copy`)).status(), 403)
	assert.equal((await context.request.post(`/api/boards/${original.id}/copy`, { headers: { origin: 'https://untrusted.test' } })).status(), 403)
	assert.equal((await context.request.post('/api/boards/invalid/copy')).status(), 404)
	assert.equal((await context.request.post(`/api/boards/${randomUUID()}/copy`)).status(), 404)
	assert.equal((await context.request.post('/api/initializeCopy', { data: snapshot })).status(), 404)
	assert.equal((await viewer.request.get('/api/getDocumentSnapshot')).status(), 404)

	await manager.goto('/'); await manager.getByTestId('board-manager').waitFor()
	await manager.getByRole('button', { name: folder.name, exact: true }).tap()
	const duplicate = async () => {
		await manager.getByRole('button', { name: `Opciones de ${run}`, exact: true }).tap()
		await manager.getByRole('menuitem', { name: 'Duplicar canvas', exact: true }).tap()
	}
	const countBefore = (await api('library')).boards.length
	await manager.route(`**/api/boards/${original.id}/copy`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'No se pudo copiar. Prueba de error.' }) }), { times: 1 })
	await duplicate(); await manager.getByRole('alert').waitFor()
	assert.equal((await api('library')).boards.length, countBefore, 'A failed request does not add an empty board')
	const response = manager.waitForResponse(r => r.url().endsWith(`/api/boards/${original.id}/copy`))
	await duplicate()
	const copyResponse = await response
	assert.equal(copyResponse.status(), 201, await copyResponse.text())
	const copy = await copyResponse.json()
	assert.notEqual(copy.id, original.id)
	assert.equal(copy.name, `Copia de ${run}`)
	assert.equal(copy.folderId, folder.id)
	assert.equal(copy.favorite, false)
	assert.equal(copy.trashedAt, null)
	assert.ok(copy.thumbnailAt)
	await manager.getByRole('button', { name: `Abrir ${copy.name}`, exact: true }).waitFor()
	assert.ok((await (await viewer.request.get(`/api/boards/${copy.id}/thumbnail`)).body()).equals(png), 'The copied thumbnail matches the saved original')
	await copied.goto(`/board/${copy.id}`); await ready(copied)
	await copied.waitForFunction(() => !!window.__xpCanvasEditor.getShape('shape:copy-extra'))
	assert.deepEqual(await documentRecords(copied), snapshot, 'All pages, groups, bindings, assets, locks and eraser metadata are copied')
	assert.deepEqual(await api(`boards/${original.id}`), metadataBefore, 'Copying does not touch source metadata')
	assert.deepEqual(await api('resources'), resourcesBefore, 'Shared files are reused without duplicating library entries')
	assert.deepEqual(await (await viewer.request.get(imageSrc)).body(), png)
	await copied.evaluate(() => { window.__xpCanvasEditor.updateShape({ id: 'shape:copy-rect', type: 'geo', props: { color: 'blue' } }) })
	const observer = await viewer.newPage(); await observer.goto(`/board/${copy.id}`); await ready(observer)
	await observer.waitForFunction(() => window.__xpCanvasEditor.getShape('shape:copy-rect')?.props.color === 'blue')
	assert.deepEqual(await documentRecords(sourceViewer), snapshot, 'Editing the copy leaves the original unchanged')
	await source.evaluate(() => { window.__xpCanvasEditor.updateShape({ id: 'shape:copy-rect', type: 'geo', props: { fill: 'solid' } }) })
	await sourceViewer.waitForFunction(() => window.__xpCanvasEditor.getShape('shape:copy-rect')?.props.fill === 'solid')
	assert.equal(await copied.evaluate(() => window.__xpCanvasEditor.getShape('shape:copy-rect').props.fill), snapshot['shape:copy-rect'].props.fill, 'Editing the original leaves the copy unchanged')
	await copied.reload(); await ready(copied)
	await copied.waitForFunction(() => window.__xpCanvasEditor.getShape('shape:copy-rect')?.props.color === 'blue')
	await api(`boards/${copy.id}`, 'PATCH', { trashed: true })
	assert.equal((await context.request.post(`/api/boards/${copy.id}/copy`)).status(), 404)
	assert.deepEqual(await (await viewer.request.get(imageSrc)).body(), png, 'Trashing a copy keeps shared assets')
	const empty = await api('boards', 'POST', { name: 'e'.repeat(120) })
	const emptyCopy = await api(`boards/${empty.id}/copy`, 'POST')
	assert.equal(emptyCopy.name.length, 120)
	assert.equal(emptyCopy.folderId, null)
	assert.equal(emptyCopy.thumbnailAt, null)
	await copied.goto(`/board/${emptyCopy.id}`); await ready(copied)
	assert.equal(await copied.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().length), 0, 'An unopened empty canvas can also be copied')
	assert.deepEqual(errors, [])
	console.log('Board copy passed: menu/retry, nested folder, full document/preview, permissions, independent edits, persistence, shared files and empty canvas.')
} finally { await browser.close() }
