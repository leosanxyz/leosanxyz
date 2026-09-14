import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium, devices } from 'playwright-core'

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5174'
const run = `resources-${Date.now()}`
const fixtures = await mkdtemp(join(tmpdir(), 'xp-canvas-resources-'))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const editorContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })
const viewerContext = await browser.newContext({ baseURL })
const page = await editorContext.newPage()
const viewer = await viewerContext.newPage()
const errors = []
for (const client of [page, viewer]) client.on('pageerror', (error) => errors.push(error.message))
const resourceIds = new Set()
let qaPageId, originalPageId

async function ready(client) {
	await client.goto('/board/principal')
	await client.waitForFunction(() => Boolean(window.__xpCanvasEditor), undefined, { timeout: 20_000 })
}
async function unlock(client) {
	await client.getByRole('button', { name: 'Editar', exact: true }).click()
	await client.getByLabel('Código privado').fill(editorCode)
	await client.getByRole('button', { name: 'Entrar', exact: true }).click()
	await client.waitForFunction(() => window.__xpCanvasEditor?.getIsReadonly() === false)
}
async function selected(client = page) { return client.evaluate(() => window.__xpCanvasEditor.getOnlySelectedShape()) }
async function list() { const result = await editorContext.request.get('/api/resources'); assert.equal(result.status(), 200); return (await result.json()).resources }

try {
	await Promise.all([ready(page), ready(viewer)])
	assert.equal((await viewerContext.request.get('/api/resources')).status(), 403)
	assert.equal((await viewerContext.request.post('/api/resources/emoji', { data: { emoji: '⭐' } })).status(), 403)
	assert.equal((await viewerContext.request.post('/api/uploads/unauthorized123', { data: 'x', headers: { 'content-type': 'text/plain' } })).status(), 403)
	await unlock(page)
	assert.equal((await editorContext.request.post('/api/resources/emoji', { data: 'null', headers: { 'content-type': 'application/json' } })).status(), 400)
	assert.equal((await editorContext.request.put('/api/resources/invalidobject123', { data: 'null', headers: { 'content-type': 'application/json' } })).status(), 400)
	;({ qaPageId, originalPageId } = await page.evaluate((run) => {
		const editor = window.__xpCanvasEditor
		const originalPageId = editor.getCurrentPageId(), qaPageId = `page:${run}`
		editor.createPage({ id: qaPageId, name: run }).setCurrentPage(qaPageId)
		return { qaPageId, originalPageId }
	}, run))
	await page.getByRole('button', { name: 'Recursos', exact: true }).click()
	await page.getByTestId('resource-library').waitFor()
	execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(fixtures, 'clip.mp4')])
	execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', join(fixtures, 'sound.wav')])
	const files = [
		{ name: `${run}.png`, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') },
		{ name: `${run}.gif`, mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') },
		{ name: `${run}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF') },
		{ name: `${run}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Documento de prueba XP Canvas') },
		{ name: `${run}.mp4`, mimeType: 'video/mp4', buffer: await readFile(join(fixtures, 'clip.mp4')) },
		{ name: `${run}.wav`, mimeType: 'audio/wav', buffer: await readFile(join(fixtures, 'sound.wav')) },
	]
	await page.getByLabel('Archivos para recursos').setInputFiles(files)
	await page.getByRole('button', { name: `Insertar ${run}.wav`, exact: true }).waitFor({ timeout: 40_000 })
	const saved = (await list()).filter((r) => r.name.startsWith(run))
	assert.equal(saved.length, 6)
	for (const r of saved) resourceIds.add(r.id)
	const gif = saved.find((r) => r.mimeType === 'image/gif')
	assert.ok(gif.previewSrc, 'Animated images have static library thumbnails')
	assert.deepEqual(await (await viewerContext.request.get(gif.src)).body(), files[1].buffer)
	const pdf = saved.find((r) => r.kind === 'document' && r.mimeType === 'application/pdf')
	const video = saved.find((r) => r.kind === 'video')
	const downloaded = await viewerContext.request.get(pdf.src)
	assert.equal(downloaded.status(), 200)
	assert.match(downloaded.headers()['content-disposition'], /^attachment/)
	assert.match(downloaded.headers()['content-security-policy'], /default-src 'none'/)
	for (const range of ['bytes=0-1', 'bytes=0-', 'bytes=-10']) {
		const response = await viewerContext.request.get(video.src, { headers: { range } })
		assert.equal(response.status(), 206)
		assert.ok(response.headers()['content-range'])
	}
	assert.equal((await viewerContext.request.get(video.src, { headers: { range: 'bytes=99999999-' } })).status(), 416)
	assert.equal((await editorContext.request.post('/api/uploads/fakevideo123456', { data: '<html>bad</html>', headers: { 'content-type': 'video/mp4' } })).status(), 400)
	assert.equal((await editorContext.request.post(pdf.src, { data: files[2].buffer, headers: { 'content-type': 'application/pdf' } })).status(), 409)

	// Native image/video shapes share one asset. Documents/audio are native box shapes.
	for (const file of files) {
		await page.getByRole('button', { name: `Insertar ${file.name}`, exact: true }).click()
		const shape = await selected()
		const expected = file.mimeType.startsWith('image/') ? 'image' : file.mimeType.startsWith('video/') ? 'video' : 'resource'
		assert.equal(shape.type, expected)
		await viewer.waitForFunction((id) => Boolean(window.__xpCanvasEditor.getShape(id)), shape.id)
		if (shape.type === 'video') {
			assert.equal(shape.props.autoplay, false)
			await page.getByTestId(`video-play-${shape.id}`).click()
			await page.locator('.tl-shape[data-shape-id="' + shape.id + '"] video').waitFor()
			await page.locator(`[data-shape-id="${shape.id}"] video`).evaluate((video) => video.load())
			await page.waitForFunction((id) => document.querySelector(`[data-shape-id="${id}"] video`)?.readyState >= 2, shape.id)
			const playback = await page.locator(`[data-shape-id="${shape.id}"] video`).evaluate(async (video) => {
				if (video.muted || video.loop) throw new Error('Video should start with sound and without looping')
				await video.play()
				await new Promise((resolve) => setTimeout(resolve, 150))
				video.pause()
				const advanced = video.currentTime > 0
				await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Video seek timed out')), 3000)
					video.addEventListener('seeked', () => { clearTimeout(timeout); resolve() }, { once: true })
					video.currentTime = .5
				})
				return { advanced, seek: video.currentTime }
			})
			assert.equal(playback.advanced, true); assert.equal(playback.seek, .5)
		}
	}
	await page.getByRole('button', { name: `Insertar ${run}.png`, exact: true }).click()
	const image1 = await selected()
	await page.getByRole('button', { name: `Insertar ${run}.png`, exact: true }).click()
	assert.equal((await selected()).props.assetId, image1.props.assetId)
	const beforeUndo = await selected()
	await page.evaluate(() => { window.__xpCanvasEditor.undo() })
	assert.equal(await page.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), beforeUndo.id), false)
	await page.evaluate(() => { window.__xpCanvasEditor.redo() })
	assert.equal(await page.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), beforeUndo.id), true)

	// Real pointer capture drag ends at the correct page coordinates, even with a camera transform.
	await page.evaluate(() => { window.__xpCanvasEditor.setCamera({ x: 50, y: -30, z: 1.5 }) })
	const dragButton = page.getByRole('button', { name: `Insertar ${run}.pdf`, exact: true })
	await dragButton.scrollIntoViewIfNeeded()
	const box = await dragButton.boundingBox()
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down(); await page.mouse.move(920, 480, { steps: 10 }); await page.mouse.up()
	const dropped = await selected()
	assert.equal(dropped.type, 'resource')
	const expected = await page.evaluate(() => window.__xpCanvasEditor.screenToPage({ x: 920, y: 480 }))
	assert.ok(Math.abs(dropped.x + dropped.props.w / 2 - expected.x) < 1)
	assert.ok(Math.abs(dropped.y + dropped.props.h / 2 - expected.y) < 1)
	// Resize, rotation, grouping and arrow bindings work on the custom document shape.
	const edited = await page.evaluate((id) => {
		const editor = window.__xpCanvasEditor
		editor.select(id).resizeShape(id, { x: 1.2, y: 1.2 }).rotateShapesBy([id], Math.PI / 4)
		const shape = editor.getShape(id)
		editor.createShape({ id: 'shape:resource-test-arrow', type: 'arrow', x: shape.x, y: shape.y, props: { start: { x: 0, y: -100 }, end: { x: 50, y: 50 } } })
		editor.createBinding({ type: 'arrow', fromId: 'shape:resource-test-arrow', toId: id, props: { terminal: 'end', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: true } })
		editor.groupShapes([id, 'shape:resource-test-arrow'])
		return { w: shape.props.w, rotation: shape.rotation, bindings: editor.getBindingsToShape(id, 'arrow').length, parentType: editor.getShape(editor.getShape(id).parentId)?.type }
	}, dropped.id)
	assert.ok(edited.w > 320); assert.ok(edited.rotation > 0); assert.equal(edited.bindings, 1); assert.equal(edited.parentType, 'group')

	await page.getByRole('button', { name: 'Cerrar recursos', exact: true }).click()
	await page.getByRole('button', { name: 'Emojis', exact: true }).click()
	await page.getByRole('button', { name: 'Insertar 😀', exact: true }).click()
	assert.equal((await selected()).type, 'image')
	await page.getByRole('button', { name: 'Cerrar emojis', exact: true }).click()
	assert.equal((await list()).filter((r) => r.name.startsWith(run)).length, 6)
	assert.equal((await viewerContext.request.get(pdf.src)).status(), 200)
	assert.ok(await viewer.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), dropped.id))

	await ready(page)
	await page.getByRole('button', { name: 'Recursos', exact: true }).click()
	await page.getByRole('button', { name: `Insertar ${run}.pdf`, exact: true }).waitFor()
	await page.evaluate((id) => { window.__xpCanvasEditor.setCurrentPage(id) }, qaPageId)
	assert.ok(await page.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), dropped.id))

	// A separate touch client sees the same resources; portrait/landscape and touch insertion.
	const ipad = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	const ipadPage = await ipad.newPage()
	await ready(ipadPage); await unlock(ipadPage)
	await ipadPage.evaluate((id) => { window.__xpCanvasEditor.setCurrentPage(id) }, qaPageId)
	await ipadPage.getByTestId('ipad-toolbar.resources').tap()
	await ipadPage.getByTestId('resource-library').waitFor()
	for (const size of [{ width: 1194, height: 834 }, { width: 834, height: 1194 }]) {
		await ipadPage.setViewportSize(size)
		const layout = await ipadPage.getByTestId('resource-library').boundingBox()
		assert.ok(layout.x >= 68 && layout.x + layout.width <= size.width && layout.y + layout.height <= size.height)
	}
	await ipadPage.getByRole('button', { name: `Insertar ${run}.pdf`, exact: true }).tap()
	const ipadShape = await selected(ipadPage)
	assert.equal(ipadShape.type, 'resource')
	await page.waitForFunction((id) => Boolean(window.__xpCanvasEditor.getShape(id)), ipadShape.id)
	const touchDrag = ipadPage.getByRole('button', { name: `Insertar ${run}.pdf`, exact: true })
	await touchDrag.scrollIntoViewIfNeeded()
	const touchBox = await touchDrag.boundingBox()
	const cdp = await ipad.newCDPSession(ipadPage)
	const startX = touchBox.x + touchBox.width / 2, startY = touchBox.y + touchBox.height / 2
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY, id: 7 }] })
	for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + (680 - startX) * step / 10, y: startY + (650 - startY) * step / 10, id: 7 }] })
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	const touchDropped = await selected(ipadPage)
	assert.equal(touchDropped.type, 'resource'); assert.notEqual(touchDropped.id, ipadShape.id)
	await ipad.close()
	assert.deepEqual(errors, [])
	console.log('Resources smoke passed: uploads, media ranges/playback, auth, drag, camera coordinates, touch, direct emojis, reuse, undo/redo, arrows, grouping, reload and collaboration.')
} finally {
	for (const id of resourceIds) await editorContext.request.delete(`/api/resources/${id}`).catch(() => {})
	if (qaPageId) await page.evaluate(({ qaPageId, originalPageId }) => {
		const editor = window.__xpCanvasEditor
		if (!editor) return
		editor.setCurrentPage(originalPageId)
		if (editor.getPage(qaPageId)) editor.deletePage(qaPageId)
	}, { qaPageId, originalPageId }).catch(() => {})
	await browser.close()
	await rm(fixtures, { recursive: true })
}
