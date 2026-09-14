import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { chromium, devices } from 'playwright-core'
// Fixture writes require an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
try {
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	await context.request.post('/api/editor-session', { data: { code: editorCode } })
	const board = await (await context.request.post('/api/boards', { data: { name: `refinements-${Date.now()}` } })).json()
	const page = await context.newPage(), errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(`/board/${board.id}`); await page.waitForFunction(() => Boolean(window.__xpCanvasEditor))
	const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
	const emojiId = await page.evaluate(async () => {
		const { insertEmoji } = await import('/client/emojis/insertEmoji.ts')
		return insertEmoji(window.__xpCanvasEditor, '😀', { x: 500, y: 300 })
	})
	await frame()
	const emoji = page.locator(`[data-shape-id="${emojiId}"]`)
	await emoji.dblclick()
	await page.waitForFunction(() => Boolean(document.querySelector('.tlui-image__toolbar [data-testid="delete-selection"]')))
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getEditingShapeId()), null)
	assert.equal(await page.evaluate(() => window.__xpCanvasEditor.getCroppingShapeId()), null)
	const asset = await page.evaluate((id) => { const e = window.__xpCanvasEditor; return e.getAsset(e.getShape(id).props.assetId) }, emojiId)
	assert.match(asset.props.src, /^data:image\/png;base64,/)
	await page.getByTestId('delete-selection').tap()
	assert.equal(await page.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), emojiId), false)
	await page.getByTestId('ipad-toolbar.undo').tap()
	assert.equal(await page.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(id)), emojiId), true)
	console.log('Emoji PNG, no text editor or crop on double-click, visible trash and undo passed.')
	await page.evaluate(async () => {
		const source = await (await fetch('/client/eraser/PartialEraserTool.ts')).text()
		window.__testTl = await import(source.match(/from "([^"]*\/tldraw.js[^\"]*)"/)[1])
		const { b64Vecs, toRichText } = window.__testTl, e = window.__xpCanvasEditor
		e.createShapes([{ id: 'shape:legacy-emoji', type: 'text', x: 300, y: 500, props: { richText: toRichText('👋🏽') } },
			{ id: 'shape:ordinary-text', type: 'text', x: 400, y: 500, props: { richText: toRichText('Hola 😀') } }])
		if (e.getShapeUtil('text').canEdit(e.getShape('shape:legacy-emoji'))) throw new Error('Legacy emoji must not edit as text')
		if (!e.getShapeUtil('text').canEdit(e.getShape('shape:ordinary-text'))) throw new Error('Normal text must still edit')
		e.createShape({ id: 'shape:ink', type: 'draw', x: 300, y: 300,
			props: { segments: [{ type: 'free', path: b64Vecs.encodePoints([{ x: 0, y: 0, z: .2 }, { x: 300, y: 0, z: .8 }]) }], isComplete: true, isPen: true, color: 'blue' } })
		e.createShape({ id: 'shape:quickshape', type: 'geo', x: 400, y: 270, props: { w: 80, h: 60, fill: 'solid', dash: 'solid' } })
		e.setSelectedShapes([]).setCurrentTool('eraser')
	})
	async function point(name, x, y) {
		await page.evaluate(({ name, x, y }) => {
			const e = window.__xpCanvasEditor, screen = e.pageToScreen({ x, y })
			e.dispatch({ type: 'pointer', target: 'canvas', name, point: { ...screen, z: .5 }, pointerId: 7, button: 0,
				isPen: e.getInstanceState().isPenMode, isPenDirect: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, accelKey: false })
		}, { name, x, y })
		await frame()
	}
	const original = await page.evaluate(() => {
		const e = window.__xpCanvasEditor
		return { shape: e.getShape('shape:ink'), paths: [...document.querySelectorAll('[data-shape-id="shape:ink"] [data-erase-ink] path')].map(p => p.getAttribute('d')) }
	})
	await point('pointer_down', 450, 270); await point('pointer_move', 450, 330); await point('pointer_up', 450, 330)
	const erased = await page.evaluate(() => {
		const e = window.__xpCanvasEditor
		return { shape: e.getShape('shape:ink'), paths: [...document.querySelectorAll('[data-shape-id="shape:ink"] [data-erase-ink] path')].map(p => p.getAttribute('d')),
			geo: e.getShape('shape:quickshape') }
	})
	assert.deepEqual(erased.shape.props, original.shape.props, 'Original points and pressure never change')
	assert.deepEqual(erased.paths, original.paths, 'Native SVG paths never re-smooth while erasing')
	assert.equal(erased.shape.x, original.shape.x); assert.equal(erased.shape.y, original.shape.y)
	assert.equal(erased.shape.meta.eraseMask.strokes.length, 1)
	assert.equal(erased.geo.meta.eraseMask.strokes.length, 1, 'QuickShape figures support area erasing')
	const alpha = await page.evaluate(async () => {
		const e = window.__xpCanvasEditor
		const { svg } = await e.getSvgString(['shape:quickshape'], { background: false, padding: 0 })
		const img = new Image(); img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`; await img.decode()
		const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
		const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
		return [ctx.getImageData(15, 30, 1, 1).data[3], ctx.getImageData(50, 30, 1, 1).data[3]]
	})
	assert.ok(alpha[0] > 240, 'Figure outside the cut remains visible')
	assert.equal(alpha[1], 0, 'Erased region exports as real transparency, not white paint')
	const liveAlpha = await page.evaluate(async () => {
		const svg = document.querySelector('[data-shape-id="shape:quickshape"] svg').cloneNode(true)
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('viewBox', '0 0 80 60')
		svg.setAttribute('width', '80'); svg.setAttribute('height', '60')
		const img = new Image(); img.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`; await img.decode()
		const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
		const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
		return [ctx.getImageData(15, 30, 1, 1).data[3], ctx.getImageData(50, 30, 1, 1).data[3]]
	})
	assert.deepEqual(liveAlpha, [255, 0], 'Live inline SVG has the same precise transparent cut')
	await page.evaluate(() => { window.__xpCanvasEditor.undo() })
	assert.equal(await page.evaluate(() => Boolean(window.__xpCanvasEditor.getShape('shape:ink').meta.eraseMask)), false)
	await page.evaluate(() => { window.__xpCanvasEditor.redo() })
	assert.equal(await page.evaluate(() => Boolean(window.__xpCanvasEditor.getShape('shape:ink').meta.eraseMask)), true)
	await page.evaluate(() => { window.__xpCanvasEditor.undo() })
	await point('pointer_down', 450, 300)
	await page.evaluate(() => { window.__xpCanvasEditor.cancel() })
	assert.equal(await page.evaluate(() => Boolean(window.__xpCanvasEditor.getShape('shape:ink').meta.eraseMask)), false)
	await point('pointer_up', 450, 300)
	await page.evaluate(() => {
		const e = window.__xpCanvasEditor
		e.updateShapes([{ id: 'shape:ink', type: 'draw', isLocked: true }]); e.setCurrentTool('eraser')
	})
	await point('pointer_down', 450, 300); await point('pointer_up', 450, 300)
	assert.equal(await page.evaluate(() => Boolean(window.__xpCanvasEditor.getShape('shape:ink').meta.eraseMask)), false)
	await page.evaluate(() => {
		const e = window.__xpCanvasEditor
		e.updateShapes([{ id: 'shape:ink', type: 'draw', isLocked: false, rotation: Math.PI / 2, props: { scaleX: 2, scaleY: .5 } }])
		e.setCamera({ x: -220, y: -480, z: 4 })
	})
	await point('pointer_down', 280, 600); await point('pointer_move', 320, 600); await point('pointer_up', 320, 600)
	const pieces = await page.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().filter((s) => s.type === 'draw'))
	assert.equal(pieces.length, 1, 'Area erasing keeps the original shape')
	assert.ok(pieces[0].meta.eraseMask, 'Rotated and resized ink cuts at high zoom')
	assert.ok(pieces.every((s) => s.rotation === Math.PI / 2 && s.props.scaleX === 2 && s.props.scaleY === .5))
	const observerContext = await browser.newContext({ baseURL })
	const observer = await observerContext.newPage()
	await observer.goto(`/board/${board.id}`)
	await observer.waitForFunction(() => Boolean(window.__xpCanvasEditor?.getShape('shape:ink')?.meta.eraseMask))
	await page.reload(); await page.waitForFunction(() => Boolean(window.__xpCanvasEditor))
	await page.waitForFunction(() => Boolean(window.__xpCanvasEditor?.getShape('shape:ink')?.meta.eraseMask))
	await page.evaluate(async () => {
		const source = await (await fetch('/client/eraser/PartialEraserTool.ts')).text()
		window.__testTl = await import(source.match(/from "([^"]*\/tldraw.js[^\"]*)"/)[1])
		const { b64Vecs } = window.__testTl, e = window.__xpCanvasEditor
		e.setCamera({ x: 0, y: 0, z: 1 }).setCurrentTool('eraser')
		for (const [id, type, y, points] of [
			['ends', 'draw', 100, [{ x: 0, y: 0, z: .5 }, { x: 100, y: 0, z: .5 }]],
			['old-dot', 'draw', 180, [{ x: 100, y: 0, z: .5 }, { x: 100.2, y: 0, z: .5 }]],
			['marker', 'highlight', 240, [{ x: 0, y: 0, z: .5 }, { x: 100, y: 0, z: .5 }]],
		]) e.createShape({ id: `shape:${id}`, type, x: 600, y, props: { segments: [{ type: 'free', path: b64Vecs.encodePoints(points) }], isComplete: true } })
		e.createShape({ id: 'shape:straight', type: 'line', x: 600, y: 320, props: { points: { a1: { id: 'a1', index: 'a1', x: 0, y: 0 }, a2: { id: 'a2', index: 'a2', x: 100, y: 0 } } } })
	})
	async function sweep(x1, y1, x2, y2) {
		await point('pointer_down', x1, y1); await point('pointer_move', x2, y2); await point('pointer_up', x2, y2)
	}
	await sweep(590, 100, 635, 100)
	await sweep(710, 100, 665, 100)
	assert.equal(await page.evaluate(async () => {
		const { isErased } = await import('/client/eraser/eraseMask.ts')
		const shape = window.__xpCanvasEditor.getShape('shape:ends')
		return isErased({ x: 50, y: 0 }, shape.meta.eraseMask)
	}), false, 'Both ends erased with a small central remnant')
	await sweep(650, 100, 650, 100)
	assert.equal(await page.evaluate(() => Boolean(window.__xpCanvasEditor.getShape('shape:ends'))), false, 'The final remnant can be erased completely')
	await sweep(700, 180, 700, 180)
	assert.equal(await page.evaluate(async () => {
		const shape = window.__xpCanvasEditor.getShape('shape:old-dot')
		if (!shape) return true
		const { isErased } = await import('/client/eraser/eraseMask.ts')
		return isErased({ x: 100, y: 0 }, shape.meta.eraseMask)
	}), true, 'Legacy off-origin tiny dots are reachable')
	await sweep(650, 220, 650, 260); await sweep(650, 300, 650, 340)
	for (const id of ['marker', 'straight']) {
		assert.equal(await page.evaluate((id) => Boolean(window.__xpCanvasEditor.getShape(`shape:${id}`).meta.eraseMask), id), true)
	}
	const transformed = await page.evaluate(async () => {
		const e = window.__xpCanvasEditor, { eraseFrame, isErased } = await import('/client/eraser/eraseMask.ts')
		e.updateShape({ id: 'shape:quickshape', type: 'geo', meta: { eraseMask: {
			version: 1, frame: { x: 0, y: 0, w: 80, h: 60, flipX: false, flipY: false }, strokes: [{ radius: 12, points: [[20, 0], [20, 60]], frame: { x: 0, y: 0, w: 80, h: 60, flipX: false, flipY: false } }]
		} }, x: 300, y: 400, rotation: .25, props: { w: 160, h: 30, flipX: true, scale: 2 } })
		const shape = e.getShape('shape:quickshape'), frame = eraseFrame(shape, e.getShapeGeometry(shape).bounds)
		const hit = isErased({ x: 120, y: 15 }, shape.meta.eraseMask, frame)
		const { svg } = await e.getSvgString([shape.id], { background: false, padding: 0 })
		return { hit, hasMask: svg.includes('<mask'), retainedRotation: shape.rotation === .25 }
	})
	assert.deepEqual(transformed, { hit: true, hasMask: true, retainedRotation: true })
	await page.evaluate(() => { const e = window.__xpCanvasEditor; e.setCurrentTool('select').select('shape:quickshape') })
	const trash = page.getByTestId('delete-selection'); await trash.waitFor({ state: 'visible' })
	assert.equal(await trash.evaluate(el => !!el.closest('.tlui-contextual-toolbar')), true)
	await trash.tap()
	assert.equal(await page.evaluate(() => Boolean(window.__xpCanvasEditor.getShape('shape:quickshape'))), false)
	assert.deepEqual(errors, [])
	console.log('Area eraser: stable paths, QuickShape, transparent inline SVG masks, both ends then final dot, legacy dots, highlight/line, undo/redo/cancel, locks, flip/resize/rotate, zoom and persistence passed.')
} finally { await browser.close() }
