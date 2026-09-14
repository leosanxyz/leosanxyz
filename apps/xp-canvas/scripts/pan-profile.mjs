import { chromium, devices } from 'playwright-core'
import { editorCode } from './test-config.mjs'
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
// Synthetic fixture only. Do not use a user's existing board for performance writes.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	await context.request.post('/api/editor-session', { data: { code: editorCode } })
	const board = await (await context.request.post('/api/boards', { data: { name: `pan-profile-${Date.now()}` } })).json()
	const page = await context.newPage()
	await page.goto(`/board/${board.id}`)
	await page.waitForFunction(() => Boolean(window.__xpCanvasEditor))
	await page.evaluate(async () => {
		const source = await (await fetch('/client/eraser/PartialEraserTool.ts')).text()
		const { b64Vecs } = await import(source.match(/from "([^"]*\/tldraw.js[^\"]*)"/)[1])
		const editor = window.__xpCanvasEditor
		const path = b64Vecs.encodePoints(Array.from({ length: 600 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 9) * 45, z: .5 })))
		editor.createShapes(Array.from({ length: 210 }, (_, i) => ({ type: 'draw', x: (i % 10) * 50, y: Math.floor(i / 10) * 36,
			props: { segments: [{ type: 'free', path }], isComplete: true } })))
	})
	const cdp = await context.newCDPSession(page)
	await cdp.send('Performance.enable')
	await page.waitForTimeout(2500)
	for (const promoted of [false, true, false, true]) {
		await page.evaluate((value) => { document.querySelector('.tl-shapes').style.willChange = value ? 'transform' : '' }, promoted)
		for (const zoom of [1, 8]) {
			await page.evaluate((z) => window.__xpCanvasEditor.setCamera({ x: 0, y: -220, z }), zoom)
			await page.waitForTimeout(200)
			const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
			const frames = await page.evaluate(async (z) => {
				const editor = window.__xpCanvasEditor, times = [], costs = []
				let last = performance.now()
				for (let i = 0; i < 120; i++) {
					await new Promise(requestAnimationFrame)
					const now = performance.now(); times.push(now - last); last = now
					const start = performance.now(); editor.setCamera({ x: Math.sin(i / 20) * 100 / z, y: -220, z }, { immediate: true }); costs.push(performance.now() - start)
				}
				const percentile = (values, p) => values.sort((a, b) => a - b)[Math.floor(values.length * p)]
				return { frameP95: percentile(times, .95), setCameraP95: percentile(costs, .95), missed: times.filter((t) => t > 25).length }
			}, zoom)
			const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
			console.log(JSON.stringify({ promoted, zoom, ...frames, ...Object.fromEntries(['TaskDuration', 'LayoutDuration', 'RecalcStyleDuration'].map((key) => [key, Math.round((after[key] - before[key]) * 1000)])) }))
		}
	}
} finally { await browser.close() }
