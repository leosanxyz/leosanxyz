import assert from 'node:assert/strict'
import { chromium, devices } from 'playwright-core'
import { editorCode } from './test-config.mjs'

// Run only against an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	const viewerContext = await browser.newContext({ baseURL })
	assert.equal((await context.request.post('/api/editor-session', { data: { code: editorCode } })).status(), 201)
	const response = await context.request.post('/api/boards', { data: { name: `laser-${Date.now()}` } })
	assert.equal(response.status(), 201)
	const board = await response.json()
	const page = await context.newPage(), viewer = await viewerContext.newPage(), errors = []
	for (const client of [page, viewer]) {
		client.setDefaultTimeout(15_000)
		client.on('pageerror', error => errors.push(error.message))
		await client.goto(`/board/${board.id}`)
		await client.waitForFunction(() => !!window.__xpCanvasEditor)
	}
	const laser = page.getByTestId('tools.laser')
	await laser.tap()
	assert.equal(await laser.getAttribute('aria-pressed'), 'true')
	assert.equal(await laser.getAttribute('aria-label'), 'Puntero láser')
	const before = await page.evaluate(() => ({ shapes: window.__xpCanvasEditor.getCurrentPageShapes(), undo: window.__xpCanvasEditor.getCanUndo() }))
	const cdp = await context.newCDPSession(page)
	const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, force: type === 'mouseReleased' ? 0 : .6 })
	for (const reducedMotion of ['no-preference', 'reduce']) {
		await page.emulateMedia({ reducedMotion })
		await viewer.emulateMedia({ reducedMotion })
		await pen('mousePressed', 450, 330)
		for (let i = 1; i <= 10; i++) await pen('mouseMoved', 450 + i * 15, 330 + i * 4)
		await page.waitForFunction(() => window.__xpCanvasEditor.getInstanceState().scribbles.some(s => s.color === 'laser' && s.points.length > 1))
		await viewer.waitForFunction(() => window.__xpCanvasEditor.store.allRecords().some(r => r.typeName === 'instance_presence' && r.scribbles?.some(s => s.color === 'laser' && s.points.length > 1)))
		await pen('mouseReleased', 600, 370)
		await page.waitForFunction(() => window.__xpCanvasEditor.getInstanceState().scribbles.length === 0)
		await viewer.waitForFunction(() => !window.__xpCanvasEditor.store.allRecords().some(r => r.typeName === 'instance_presence' && r.scribbles?.length))
		assert.deepEqual(await page.evaluate(() => ({ shapes: window.__xpCanvasEditor.getCurrentPageShapes(), undo: window.__xpCanvasEditor.getCanUndo() })), before)
	}
	// Fingers still pan; the next Pencil contact must keep using the laser.
	const camera = await page.evaluate(() => window.__xpCanvasEditor.getCamera())
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 450, id: 1 }] })
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 590, y: 500, id: 1 }] })
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	await page.waitForFunction(previous => window.__xpCanvasEditor.getCamera().x !== previous.x, camera)
	await pen('mousePressed', 450, 330); await pen('mouseMoved', 500, 350)
	await page.waitForFunction(() => window.__xpCanvasEditor.getInstanceState().scribbles.some(s => s.color === 'laser'))
	await pen('mouseReleased', 500, 350)
	await page.getByTestId('tools.draw').tap()
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCurrentToolId()), 'draw')
	await viewer.locator('.tl-canvas').click({ position: { x: 450, y: 300 } })
	await viewer.keyboard.press('k')
	await viewer.waitForFunction(() => window.__xpCanvasEditor.getCurrentToolId() === 'laser')
	await page.reload(); await page.waitForFunction(() => !!window.__xpCanvasEditor)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().length), 0)
	assert.deepEqual(errors, [])
	console.log('Laser passed: iPad button, Pencil, shared transient trail, expiry, unchanged document/history, reduced-motion mode, finger pan and desktop K shortcut.')
} finally { await browser.close() }
