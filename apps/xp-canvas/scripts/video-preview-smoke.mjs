import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Uses only synthetic media and an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const fixture = await mkdtemp(join(tmpdir(), 'xp-preview-fixture-'))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	for (const [name, filter] of [['color', 'testsrc2=s=320x180:d=1.5'], ['black', 'color=c=black:s=320x180:d=1.5']]) {
		execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(fixture, `${name}.mp4`)])
	}
	execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=0.8', '-f', 'lavfi', '-i', 'color=c=teal:s=320x180:d=1.2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(fixture, 'intro.mp4')])
	execFileSync('ffmpeg', ['-v', 'error', '-i', join(fixture, 'black.mp4'), '-frames:v', '1', join(fixture, 'black.jpg')])
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	await context.request.post('/api/editor-session', { data: { code: editorCode } })
	const page = await context.newPage(), errors = []
	page.setDefaultTimeout(20_000)
	page.on('pageerror', error => errors.push(error.message))
	await page.goto('/')
	const clips = Object.fromEntries(await Promise.all(['color', 'black', 'intro'].map(async name => [name, (await readFile(join(fixture, `${name}.mp4`))).toString('base64')])))
	const results = await page.evaluate(async clips => {
		const { videoPreview } = await import('/client/resources/videoPreview.ts')
		const originalFrame = HTMLVideoElement.prototype.requestVideoFrameCallback, originalDraw = CanvasRenderingContext2D.prototype.drawImage
		let insideFrame = false, prematureCopies = 0
		HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
			return originalFrame.call(this, (...args) => { insideFrame = true; try { callback(...args) } finally { insideFrame = false } })
		}
		// Model Safari returning black if drawImage is called before a usable frame.
		CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
			if (source instanceof HTMLVideoElement && !insideFrame) { prematureCopies++; this.fillStyle = 'black'; this.fillRect(0, 0, this.canvas.width, this.canvas.height); return }
			return originalDraw.call(this, source, ...args)
		}
		const capture = async (name, signal) => {
			const bytes = Uint8Array.from(atob(clips[name]), char => char.charCodeAt(0))
			const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
			try {
				const result = await videoPreview(url, signal), image = await createImageBitmap(result.file)
				const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
				const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
				const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
				let total = 0; for (let i = 0; i < rgba.length; i += 4) total += rgba[i] + rgba[i + 1] + rgba[i + 2]
				image.close()
				return { average: Math.round(total / (rgba.length / 4 * 3)), bytes: Array.from(new Uint8Array(await result.file.arrayBuffer())) }
			} finally { URL.revokeObjectURL(url) }
		}
		const color = await capture('color'), intro = await capture('intro')
		let blackError, abortError
		try { await capture('black') } catch (error) { blackError = error.message }
		try { await capture('color', AbortSignal.abort()) } catch (error) { abortError = error.name }
		CanvasRenderingContext2D.prototype.drawImage = originalDraw
		HTMLVideoElement.prototype.requestVideoFrameCallback = undefined
		const fallback = await capture('color')
		HTMLVideoElement.prototype.requestVideoFrameCallback = originalFrame
		return { color, intro: intro.average, fallback: fallback.average, prematureCopies, blackError, abortError, remainingVideos: document.querySelectorAll('video').length }
	}, clips)
	assert.ok(results.color.average > 30); assert.ok(results.intro > 30); assert.ok(results.fallback > 30)
	assert.equal(results.prematureCopies, 0)
	assert.equal(results.blackError, 'No se encontró un fotograma visible.')
	assert.equal(results.abortError, 'AbortError'); assert.equal(results.remainingVideos, 0)
	console.log('Decoded-frame capture passed: pixel checks, black intro, empty capture rejection, old-browser fallback and cleanup.')

	const api = async (path, data) => { const response = await context.request.post(`/api/${path}`, { data }); assert.ok(response.ok()); return response.json() }
	const upload = async (name, bytes, mime, extra = {}) => {
		const response = await context.request.post(`/api/uploads/${randomUUID()}`, { data: bytes, headers: { 'content-type': mime, 'x-file-name': name, ...extra } })
		assert.equal(response.status(), 201); return (await response.json()).resource
	}
	const oldPoster = await upload('black.jpg', await readFile(join(fixture, 'black.jpg')), 'image/jpeg')
	const resource = await upload('repaired-preview.mp4', await readFile(join(fixture, 'color.mp4')), 'video/mp4', { 'x-save-resource': 'true', 'x-resource-preview': oldPoster.id })
	const board = await api('boards', { name: `preview-${Date.now()}` })
	await page.goto(`/board/${board.id}`); await page.waitForFunction(() => !!window.__xpCanvasEditor)
	await page.getByTestId('ipad-toolbar.resources').tap()
	await page.getByRole('button', { name: `Insertar ${resource.name}`, exact: true }).tap()
	const shape = await page.evaluate(() => window.__xpCanvasEditor.getOnlySelectedShape())
	const viewer = await browser.newContext({ baseURL }), reader = await viewer.newPage()
	await reader.goto(`/board/${board.id}`)
	await reader.waitForFunction(id => !!window.__xpCanvasEditor?.getShape(id), shape.id)
	const newPoster = await upload('correct.jpg', Buffer.from(results.color.bytes), 'image/jpeg')
	assert.equal((await context.request.put(`/api/resources/${resource.id}/preview`, { data: { previewId: newPoster.id } })).status(), 200)
	await page.reload(); await page.waitForFunction(() => !!window.__xpCanvasEditor)
	await page.waitForFunction(({ id, src }) => window.__xpCanvasEditor.getAsset(id)?.meta.previewSrc === src, { id: shape.props.assetId, src: newPoster.src })
	await reader.waitForFunction(({ id, src }) => window.__xpCanvasEditor.getAsset(id)?.meta.previewSrc === src, { id: shape.props.assetId, src: newPoster.src })
	await page.getByTestId('ipad-toolbar.resources').tap()
	for (const selector of [`[data-resource-id="${resource.id}"] img`, `[data-shape-id="${shape.id}"] .canvas-video__poster`]) {
		const image = page.locator(selector); await image.waitFor()
		assert.equal(await image.getAttribute('src'), newPoster.src)
		assert.ok(await image.evaluate(async image => {
			await image.decode()
			const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18
			const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 32, 18)
			const rgba = ctx.getImageData(0, 0, 32, 18).data
			return rgba.some((value, i) => i % 4 !== 3 && value > 30)
		}))
	}
	assert.deepEqual(await page.evaluate(id => window.__xpCanvasEditor.getShape(id), shape.id), shape)
	assert.deepEqual(errors, [])
	console.log('Repaired posters replace saved black thumbnails in Resources, canvas and a second client without changing the shape.')
} finally { await browser.close(); await rm(fixture, { recursive: true }) }
