import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { chromium, devices } from 'playwright-core'

// Synthetic boards only; use an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	await context.request.post('/api/editor-session', { data: { code: editorCode } })
	const board = await (await context.request.post('/api/boards', { data: { name: `eraser-render-${Date.now()}` } })).json()
	const page = await context.newPage(), errors = []
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(`/board/${board.id}`)
	await page.waitForFunction(() => !!window.__xpCanvasEditor)
	const result = await page.evaluate(async () => {
		const source = await (await fetch('/client/eraser/PartialEraserTool.ts')).text()
		const { b64Vecs } = await import(source.match(/from "([^"]*\/tldraw.js[^\"]*)"/)[1])
		const e = window.__xpCanvasEditor
		const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		e.createShape({ id: 'shape:render-ink', type: 'draw', x: 300, y: 300, props: {
			isComplete: true, isPen: true, size: 'xl', segments: [{ type: 'free', path: b64Vecs.encodePoints(
				Array.from({ length: 160 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 7) * 12, z: .5 + Math.sin(i / 13) * .3 }))) }],
		} })
		e.setCurrentTool('eraser'); await frame()
		const root = document.querySelector('[data-shape-id="shape:render-ink"]')
		const originalSvg = root.querySelector('svg'), originalInk = root.querySelector('svg path:not(defs path)')
		const originalD = originalInk.getAttribute('d'), originalShape = e.getShape('shape:render-ink')
		const imageMasks = new Set(), maskNodes = new Set(), maskPaths = new Set()
		let replacedSvg = 0, replacedInk = 0, changedInk = 0, missingCut = 0
		for (let i = 0; i < 25; i++) {
			const screen = e.pageToScreen({ x: 430 + i * 2, y: 285 + i * 1.3 })
			e.dispatch({ type: 'pointer', target: 'canvas', name: i === 0 ? 'pointer_down' : i === 24 ? 'pointer_up' : 'pointer_move',
				point: { ...screen, z: .5 }, pointerId: 7, button: 0, isPen: false, isPenDirect: false,
				shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, accelKey: false })
			await frame()
			if (root.querySelector('svg') !== originalSvg) replacedSvg++
			if (!originalInk.isConnected) replacedInk++
			if (root.querySelector('svg path:not(defs path)')?.getAttribute('d') !== originalD) changedInk++
			const raster = root.querySelector('.canvas-erase-mask')?.style.maskImage
			if (raster?.includes('data:image')) imageMasks.add(raster)
			const mask = root.querySelector('mask'), path = mask?.querySelector('path')
			if (mask) maskNodes.add(mask)
			if (path) maskPaths.add(path)
			if (e.getShape('shape:render-ink').meta.eraseMask && !path) missingCut++
		}
		const shape = e.getShape('shape:render-ink')
		return { replacedSvg, replacedInk, changedInk, imageMaskCount: imageMasks.size, maskNodeCount: maskNodes.size, maskPathCount: maskPaths.size, missingCut,
			propsUnchanged: JSON.stringify(shape.props) === JSON.stringify(originalShape.props) }
	})
	console.log(JSON.stringify(result))
	if (!process.env.REPORT_ONLY) {
		assert.deepEqual(result, { replacedSvg: 0, replacedInk: 0, changedInk: 0, imageMaskCount: 0, maskNodeCount: 1, maskPathCount: 1, missingCut: 0, propsUnchanged: true })
		const pixels = await page.evaluate(async () => {
			const e = window.__xpCanvasEditor, frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			const root = document.querySelector('[data-shape-id="shape:render-ink"]'), ink = root.querySelector('[data-erase-ink]')
			e.undo(); await frame()
			if (root.querySelector('[data-erase-ink]') !== ink || ink.hasAttribute('mask')) throw new Error('Undo remounted ink or retained the cut')
			e.redo(); await frame()
			if (root.querySelector('[data-erase-ink]') !== ink || !ink.hasAttribute('mask')) throw new Error('Redo remounted ink or lost the cut')
			e.createShape({ id: 'shape:sharp-edge', type: 'geo', x: 100, y: 100, props: { w: 120, h: 80, fill: 'solid', dash: 'solid' } })
			e.setCurrentTool('eraser')
			for (const [name, y] of [['pointer_down', 90], ['pointer_move', 190], ['pointer_up', 190]]) {
				const point = e.pageToScreen({ x: 160.3, y })
				e.dispatch({ type: 'pointer', target: 'canvas', name, point: { ...point, z: .5 }, pointerId: 7, button: 0, isPen: false, isPenDirect: false,
					shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, accelKey: false }); await frame()
			}
			const results = []
			for (const zoom of [1, 8]) {
				e.setCamera({ x: -100 + 50 / zoom, y: -100 + 50 / zoom, z: zoom }); await frame()
				const live = document.querySelector('[data-shape-id="shape:sharp-edge"] svg'), svg = live.cloneNode(true)
				svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('viewBox', '0 0 120 80')
				svg.setAttribute('width', String(120 * zoom)); svg.setAttribute('height', String(80 * zoom))
				const img = new Image(); img.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`; await img.decode()
				const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
				const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
				const row = ctx.getImageData(44 * zoom, 40 * zoom, 12 * zoom, 1).data
				const alpha = Array.from({ length: row.length / 4 }, (_, i) => row[i * 4 + 3])
				results.push({ zoom, softPixels: alpha.filter(a => a > 0 && a < 255).length, solid: alpha[0], cut: alpha.at(-1), mask: !!live.querySelector('mask path') })
			}
			return results
		})
		console.log('Cut-edge pixel checks:', JSON.stringify(pixels))
		for (const row of pixels) {
			assert.ok(row.softPixels <= 1, `Cut edge at ${row.zoom}x only has normal one-pixel antialiasing`)
			assert.equal(row.solid, 255); assert.equal(row.cut, 0); assert.equal(row.mask, true)
		}
	}
	assert.deepEqual(errors, [])
} finally { await browser.close() }
