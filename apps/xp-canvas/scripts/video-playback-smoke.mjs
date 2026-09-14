import assert from 'node:assert/strict'
import { editorCode } from './test-config.mjs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium, devices } from 'playwright-core'

// Fixture writes require an isolated XP_CANVAS_STATE_PATH server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5175'
const fixture = await mkdtemp(join(tmpdir(), 'xp-video-fixture-'))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
try {
	execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', join(fixture, 'clip.mp4')])
	execFileSync('ffmpeg', ['-v', 'error', '-i', join(fixture, 'clip.mp4'), '-frames:v', '1', join(fixture, 'poster.jpg')])
	const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL })
	await context.request.post('/api/editor-session', { data: { code: editorCode } })
	const run = Date.now()
	const board = await (await context.request.post('/api/boards', { data: { name: `video-playback-${run}` } })).json()
	const upload = async (id, file, type) => {
		const response = await context.request.post(`/api/uploads/${id}`, { data: await readFile(join(fixture, file)), headers: { 'content-type': type, 'x-file-name': file } })
		assert.equal(response.status(), 201)
		return `/api/uploads/${id}`
	}
	const src = await upload(`video-${run}`, 'clip.mp4', 'video/mp4')
	const poster = await upload(`poster-${run}`, 'poster.jpg', 'image/jpeg')
	const page = await context.newPage(), errors = []
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(`/board/${board.id}`); await page.waitForFunction(() => !!window.__xpCanvasEditor)
	await page.evaluate(({ src, poster }) => {
		const e = window.__xpCanvasEditor
		e.createAssets([{ id: 'asset:video-start', type: 'video', typeName: 'asset', props: { src, name: 'Test with audio', w: 320, h: 180, mimeType: 'video/mp4', isAnimated: true }, meta: { previewSrc: poster } }])
		e.createShape({ id: 'shape:video-start', type: 'video', x: 350, y: 250, props: { assetId: 'asset:video-start', w: 320, h: 180 } })
	}, { src, poster })
	const root = page.locator('[data-shape-id="shape:video-start"]'), image = root.locator('.canvas-video__poster'), video = root.locator('video')
	await image.evaluate(img => img.decode())
	assert.equal(await video.count(), 0, 'Only a lightweight poster exists before Play')
	await image.evaluate(img => {
		window.__videoPosterBeforePlay = img
		// Hold notification of the first composited frame independently of loading.
		const native = HTMLVideoElement.prototype.requestVideoFrameCallback
		let held, holding = true
		HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
			return native.call(this, (...args) => {
				if (holding) held = () => callback(...args)
				else callback(...args)
			})
		}
		window.__releaseFirstVideoFrame = () => { holding = false; held?.() }
	})
	let unblock
	const blocked = new Promise(resolve => { unblock = resolve })
	await page.route(`**${src}`, async route => { await blocked; await route.continue() })
	await page.getByTestId('video-play-shape:video-start').tap()
	await video.waitFor({ state: 'attached' })
	const loading = await root.evaluate(el => {
		const video = el.querySelector('video'), image = el.querySelector('.canvas-video__poster')
		return { posterRetained: !!image && image.complete && image.naturalWidth > 0, readyState: video.readyState, muted: video.muted, loop: video.loop }
	})
	console.log('Before media data arrives:', JSON.stringify(loading))
	unblock()
	if (!process.env.REPORT_ONLY) assert.deepEqual(loading, { posterRetained: true, readyState: 0, muted: true, loop: true })
	await page.waitForFunction(() => document.querySelector('[data-shape-id="shape:video-start"] video')?.currentTime > .1)
	if (!process.env.REPORT_ONLY) {
		assert.equal(await image.evaluate(img => img === window.__videoPosterBeforePlay), true, 'The decoded poster node survives Play until first-frame notification')
		const layers = await root.evaluate(el => {
			const img = el.querySelector('.canvas-video__poster'), video = el.querySelector('video')
			const a = img.getBoundingClientRect(), b = video.getBoundingClientRect()
			return { sameBox: ['x', 'y', 'width', 'height'].every(key => a[key] === b[key]), overlay: getComputedStyle(img).zIndex === '1' }
		})
		assert.deepEqual(layers, { sameBox: true, overlay: true }, 'Poster covers the player without layout shifts')
		await page.evaluate(() => window.__releaseFirstVideoFrame())
		await image.waitFor({ state: 'detached' })
		const looped = await video.evaluate(async video => {
			let previous = video.currentTime, wraps = 0, callback
			await new Promise(resolve => {
				const done = () => { clearTimeout(timeout); video.cancelVideoFrameCallback(callback); resolve() }
				const sample = () => {
					if (video.currentTime < previous - .5) wraps++
					previous = video.currentTime
					if (wraps === 2) done()
					else callback = video.requestVideoFrameCallback(sample)
				}
				const timeout = setTimeout(done, 5500)
				callback = video.requestVideoFrameCallback(sample)
			})
			return { wraps, connected: video.isConnected, playing: !video.paused, muted: video.muted, loop: video.loop }
		})
		assert.deepEqual(looped, { wraps: 2, connected: true, playing: true, muted: true, loop: true })
		await video.tap(); assert.equal(await video.evaluate(video => video.controls), true)
		await video.evaluate(video => video.pause()); assert.equal(await video.evaluate(video => video.paused), true)
		assert.equal(await image.count(), 0, 'Pause keeps the decoded frame, not the thumbnail')
		await video.evaluate(video => { video.muted = false })
		await page.evaluate(async () => {
			window.__xpCanvasEditor.updateShape({ id: 'shape:video-start', type: 'video', x: 351 })
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		})
		assert.equal(await video.evaluate(video => video.muted), false, 'A manual unmute survives shape renders')
		await video.evaluate(video => video.play())
		assert.equal(await video.evaluate(video => video.paused), false, 'Native controls can resume playback')
		await video.evaluate(video => video.pause())
		console.log('Stable poster through loading and first-frame handoff, mute, two loop boundaries, pause/resume and manual unmute passed.')
	}
	assert.deepEqual(errors, [])
} finally { await browser.close(); await rm(fixture, { recursive: true }) }
