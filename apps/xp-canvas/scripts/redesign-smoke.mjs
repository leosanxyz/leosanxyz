import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium, devices } from 'playwright-core'

// Use an isolated dev server: XP_CANVAS_STATE_PATH=/tmp/... npm run dev -- --port 5175.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const run = `redesign-${Date.now()}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
const viewerContext = await browser.newContext({ baseURL })
const page = await context.newPage(), viewer = await viewerContext.newPage()
const fixtures = await mkdtemp(join(tmpdir(), 'xp-canvas-redesign-fixtures-'))
const errors = []
for (const client of [page, viewer]) client.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(15_000)
const cdp = await context.newCDPSession(page)
const api = async (path, method = 'GET', data) => {
	const response = await context.request.fetch(`/api/${path}`, { method, ...(data === undefined ? {} : { data }) })
	assert.ok(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`)
	return response.json()
}
const ready = async (client = page) => client.waitForFunction(() => Boolean(window.__xpCanvasEditor), undefined, { timeout: 25_000 })
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 1]) => ({ x, y, id })) })
const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
async function swipe(x, y, dx, dy) {
	await touch('touchStart', [[x, y]])
	for (let i = 1; i <= 8; i++) await touch('touchMove', [[x + dx * i / 8, y + dy * i / 8]])
	await touch('touchEnd', []); await frames()
}
async function pen(type, x, y) {
	await cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, force: type === 'mouseReleased' ? 0 : .6 })
}

try {
	assert.equal((await viewerContext.request.get('/api/library')).status(), 403)
	assert.equal((await viewerContext.request.post('/api/boards', { data: { name: 'unauthorized' } })).status(), 403)
	await page.goto('/')
	await page.getByRole('button', { name: 'Editar', exact: true }).tap()
	await page.getByLabel('Código privado').fill(editorCode)
	await page.getByRole('button', { name: 'Entrar', exact: true }).tap()
	await page.getByTestId('board-manager').waitFor()
	await page.getByRole('button', { name: 'Abrir Principal', exact: true }).waitFor()
	await page.getByRole('button', { name: 'Nueva carpeta', exact: true }).tap()
	await page.getByLabel('Nombre', { exact: true }).fill(run)
	await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
	await page.getByRole('heading', { name: run, exact: true }).waitFor()
	await page.getByRole('button', { name: 'Nueva carpeta', exact: true }).tap()
	await page.getByLabel('Nombre', { exact: true }).fill(`${run}-hija`)
	await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
	await page.getByRole('heading', { name: `${run}-hija`, exact: true }).waitFor()
	const library = await api('library')
	const parent = library.folders.find((folder) => folder.name === run), child = library.folders.find((folder) => folder.name === `${run}-hija`)
	assert.equal(child.parentId, parent.id)
	assert.equal((await context.request.patch(`/api/folders/${parent.id}`, { data: { parentId: child.id } })).status(), 400)
	await page.getByRole('button', { name: 'Nuevo canvas', exact: true }).tap()
	await ready()
	const firstId = new URL(page.url()).pathname.split('/').pop()
	assert.notEqual(firstId, 'principal')
	assert.equal((await api(`boards/${firstId}`)).folderId, child.id)
	await page.locator('.canvas-board-title').tap()
	await page.getByLabel('Nombre', { exact: true }).fill(`${run}-board`)
	await page.getByRole('button', { name: 'Guardar', exact: true }).tap()
	await page.locator('.canvas-board-title').filter({ hasText: `${run}-board` }).waitFor()
	console.log('Manager: editor access, nested folders, cycle rejection, independent board creation and rename passed.')

	await page.getByTestId('ipad-toolbar.resources').tap()
	await page.getByTestId('resource-library').waitFor()
	assert.equal(await page.locator('.resource-library input[type="search"]').count(), 0)
	for (const text of ['Guardar selección', 'Actualizar', 'Tu biblioteca', 'Toca para insertar', 'Emoji']) assert.equal((await page.getByTestId('resource-library').innerText()).includes(text), false)
	execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=teal:s=320x180:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(fixtures, 'clip.mp4')])
	const files = [
		{ name: `${run}.png`, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') },
		{ name: `${run}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF') },
		{ name: `${run}.mp4`, mimeType: 'video/mp4', buffer: await readFile(join(fixtures, 'clip.mp4')) },
	]
	await page.getByLabel('Archivos para recursos').setInputFiles(files)
	await page.getByRole('button', { name: `Insertar ${run}.mp4`, exact: true }).waitFor({ timeout: 30_000 })
	const resourceCount = (await api('resources')).resources.length
	await page.getByRole('button', { name: `Insertar ${run}.mp4`, exact: true }).tap()
	const videoId = await page.evaluate(() => window.__xpCanvasEditor.getOnlySelectedShapeId())
	await page.getByRole('button', { name: 'Cerrar recursos', exact: true }).tap()
	const play = page.getByTestId(`video-play-${videoId}`)
	await play.waitFor()
	await play.tap()
	await page.waitForFunction((id) => document.querySelector(`[data-shape-id="${id}"] video`)?.currentTime > .1, videoId)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getEditingShapeId()), null)
	assert.equal(await page.getByRole('menu').count(), 0)
	assert.equal(await page.locator(`[data-shape-id="${videoId}"] video`).evaluate((video) => video.controls), false)
	assert.equal(await play.count(), 0)
	await page.locator(`[data-shape-id="${videoId}"] video`).tap()
	assert.equal(await page.locator(`[data-shape-id="${videoId}"] video`).evaluate((video) => video.controls), true)
	await page.locator(`[data-shape-id="${videoId}"] video`).evaluate(video => video.pause())
	assert.equal(await play.count(), 0, 'Native controls handle pause and replay')
	console.log('Resources and video: minimal panel, upload, poster and one-tap playback without edit mode passed.')

	await page.getByTestId('ipad-toolbar.emojis').tap()
	await page.getByTestId('emoji-picker').waitFor()
	assert.ok(await page.locator('.emoji-picker__grid button').count() > 1800)
	assert.equal(await page.locator('.emoji-picker input').count(), 0)
	for (const size of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
		await page.setViewportSize(size)
		const bounds = await page.getByTestId('emoji-picker').boundingBox()
		assert.ok(bounds.x >= 68 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height)
		assert.ok(await page.locator('.emoji-picker__categories button').evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().width >= 44)))
	}
	await page.locator('[data-emoji-group="0"]').getByRole('button', { name: 'Insertar 😀', exact: true }).tap()
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getOnlySelectedShape().type), 'image')
	assert.equal((await api('resources')).resources.length, resourceCount, 'Emoji insertion never requires a library entry')
	await page.getByRole('button', { name: 'Banderas', exact: true }).tap()
	await page.locator('[data-emoji-group="8"]').getByRole('button', { name: 'Insertar 🇲🇽', exact: true }).tap()
	await page.getByRole('button', { name: 'Cerrar emojis', exact: true }).tap()
	console.log('Emojis: complete categorized grid and immediate insertion passed.')

	const second = await api('boards', 'POST', { name: `${run}-gestures` })
	await page.goto(`/board/${second.id}`); await ready()
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().length), 0)
	await viewer.goto(`/board/${firstId}`); await ready(viewer)
	assert.ok(await viewer.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), videoId))
	await page.evaluate(() => {
		const editor = window.__xpCanvasEditor
		editor.setCamera({ x: 0, y: 0, z: 1 }).setCurrentTool('draw')
		editor.updateInstanceState({ isPenMode: true })
		editor.createShape({ id: 'shape:touch-target', type: 'geo', x: 260, y: 200, props: { geo: 'rectangle', w: 160, h: 110, fill: 'solid' } })
	})
	const cameraBefore = await page.evaluate(() => window.__xpCanvasEditor.getCamera())
	await swipe(700, 650, 80, 45)
	const cameraAfter = await page.evaluate(() => window.__xpCanvasEditor.getCamera())
	assert.ok(Math.abs(cameraAfter.x - cameraBefore.x - 80) < 2)
	assert.equal(cameraAfter.z, cameraBefore.z)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().length), 1, 'One finger never draws')
	const target = await page.evaluate(() => window.__xpCanvasEditor.pageToScreen({ x: 340, y: 255 }))
	await touch('touchStart', [[target.x, target.y]]); await touch('touchEnd', []); await frames()
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getOnlySelectedShapeId()), 'shape:touch-target')
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getInstanceState().isPenMode), true)
	await swipe(target.x, target.y, 60, 25)
	const moved = await page.evaluate(() => window.__xpCanvasEditor.getShape('shape:touch-target'))
	assert.ok(Math.abs(moved.x - 320) < 2)
	await page.evaluate(() => { window.__xpCanvasEditor.undo() })
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getShape('shape:touch-target').x), 260)
	await page.evaluate(() => { window.__xpCanvasEditor.redo() })
	await pen('mousePressed', 900, 590)
	for (let i = 1; i <= 10; i++) await pen('mouseMoved', 900 + i * 7, 590 + i * 4)
	await pen('mouseReleased', 970, 630)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCurrentToolId()), 'draw')
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().filter((shape) => shape.type === 'draw').length), 1)
	const pinchBefore = await page.evaluate(() => window.__xpCanvasEditor.getCamera())
	await touch('touchStart', [[650, 600, 1]])
	await touch('touchStart', [[650, 600, 1], [850, 600, 2]])
	for (let i = 1; i <= 8; i++) await touch('touchMove', [[650 - i * 8, 600, 1], [850 + i * 8, 600, 2]])
	await touch('touchEnd', []); await frames()
	assert.ok(await page.evaluate((z) => window.__xpCanvasEditor.getZoomLevel() > z * 1.4, pinchBefore.z))
	console.log('Touch: single-finger pan/select/drag, undo, Pencil drawing without changing modes and two-finger zoom passed.')

	// Exact QuickShape lifecycle: draw -> hold/ghost -> release/replacement -> one undo.
	await page.evaluate(() => { const editor = window.__xpCanvasEditor; editor.setCamera({ x: 0, y: 0, z: 1 }); editor.setCurrentTool('draw'); editor.updateInstanceState({ isGridMode: false }) })
	const points = []
	for (let i = 0; i < 12; i++) points.push([520 + i * 15, 250])
	for (let i = 0; i < 9; i++) points.push([700, 250 + i * 15])
	for (let i = 0; i < 12; i++) points.push([700 - i * 15, 385])
	for (let i = 0; i <= 9; i++) points.push([520, 385 - i * 15])
	const before = await page.evaluate(() => [...window.__xpCanvasEditor.getCurrentPageShapeIds()])
	await pen('mousePressed', ...points[0])
	for (const point of points.slice(1)) await pen('mouseMoved', ...point)
	await page.locator('.quick-shape-preview').waitFor({ state: 'visible', timeout: 3000 })
	assert.equal(await page.evaluate((before) => window.__xpCanvasEditor.getCurrentPageShapes().filter((shape) => !before.includes(shape.id))[0].type, before), 'draw')
	await pen('mouseReleased', ...points.at(-1))
	await page.locator('.quick-shape-preview').waitFor({ state: 'hidden' })
	const converted = await page.evaluate((before) => window.__xpCanvasEditor.getCurrentPageShapes().filter((shape) => !before.includes(shape.id)), before)
	assert.equal(converted.length, 1); assert.equal(converted[0].type, 'geo'); assert.equal(converted[0].props.geo, 'rectangle')
	await page.evaluate(() => { window.__xpCanvasEditor.undo() })
	assert.equal(await page.evaluate((before) => window.__xpCanvasEditor.getCurrentPageShapes().filter((shape) => !before.includes(shape.id)).length, before), 0)
	await page.evaluate(() => { window.__xpCanvasEditor.redo() })
	console.log('QuickShape: native pen events, ghost only while held, release commit and one-step undo passed.')

	// waitForFunction treats a returned Promise as truthy; poll the awaited API result here.
	await page.evaluate(async (id) => {
		for (let attempt = 0; attempt < 50; attempt++) {
			const response = await fetch(`/api/boards/${id}`, { cache: 'no-store' })
			const board = await response.json()
			if (response.ok && typeof board.thumbnailAt === 'number') return
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
		throw new Error('Board thumbnail was not saved')
	}, second.id)
	assert.equal((await context.request.get(`/api/boards/${second.id}/thumbnail`)).status(), 200)
	await page.getByRole('button', { name: 'Mis canvases', exact: true }).tap()
	await page.getByTestId('board-manager').waitFor()
	await page.locator(`[data-board-id="${second.id}"] img`).evaluate(async (image) => image.decode())
	await page.getByRole('button', { name: `Opciones de ${second.name}`, exact: true }).tap()
	await page.getByRole('menuitem', { name: 'Mover a carpeta', exact: true }).click()
	await page.getByLabel('Carpeta de destino').selectOption(child.id)
	await page.getByRole('button', { name: 'Mover', exact: true }).tap()
	assert.equal((await api(`boards/${second.id}`)).folderId, child.id)
	await page.getByRole('button', { name: `Opciones de ${second.name}`, exact: true }).tap()
	await page.getByRole('menuitem', { name: 'Añadir a favoritos', exact: true }).click()
	await page.getByRole('button', { name: 'Favoritos', exact: true }).tap()
	await page.getByRole('button', { name: `Abrir ${second.name}`, exact: true }).waitFor()
	await page.reload(); await page.getByTestId('board-manager').waitFor()
	assert.equal((await api(`boards/${second.id}`)).favorite, true)
	await api(`boards/${second.id}`, 'PATCH', { trashed: true })
	assert.equal((await viewerContext.request.get(`/api/boards/${second.id}`)).status(), 404)
	await page.reload(); await page.getByTestId('board-manager').waitFor()
	await page.getByRole('button', { name: /^Cuenta de / }).tap()
	await page.getByRole('menuitem', { name: 'Papelera', exact: true }).tap()
	await page.getByRole('button', { name: `Opciones de ${second.name}`, exact: true }).tap()
	await page.getByRole('menuitem', { name: 'Restaurar', exact: true }).click()
	await page.getByRole('button', { name: 'Todos', exact: true }).tap()
	await page.getByRole('button', { name: `Abrir ${second.name}`, exact: true }).tap(); await ready()
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getShape('shape:touch-target').type), 'geo')
	console.log('Manager: rendered thumbnails, folder move, favorites, persistence and board isolation passed.')
	assert.deepEqual(errors, [])
	console.log('Redesign smoke passed.')
} finally {
	await browser.close()
	await rm(fixtures, { recursive: true })
}
