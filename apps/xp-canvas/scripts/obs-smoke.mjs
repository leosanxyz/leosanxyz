import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Relé de OBS de punta a punta con un dock falso: token, canción para el alumno, salto de capítulo del maestro y desconexión.
// Crea cuentas y documentos ficticios: usa un servidor de QA aislado (XP_PORTAL_QA=1 trae el token de prueba).
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('OBS smoke requires localhost and isolated QA state.')
const TOKEN = process.env.OBS_RELAY_TOKEN_QA ?? '0'.repeat(64)
const shots = process.env.OBS_SHOTS ?? '/tmp/obs-qa'
await mkdir(shots, { recursive: true })
const relayURL = `${baseURL.replace(/^http/, 'ws')}/api/obs/relay`
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...parts) => console.log(...parts)

function openDock(token) {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(relayURL, ['obs-relay', token])
		const received = []
		socket.onmessage = (event) => { received.push(JSON.parse(event.data)); log('dock ←', event.data) }
		socket.onopen = () => resolve({ socket, received })
		socket.onerror = () => reject(new Error('rejected'))
	})
}
const estado = (capitulo, sonando) => ({ tipo: 'estado', capitulo, titulos: ['Repaso', 'Primer paso', 'Juega'].slice(0, 2), visible: true, sonando })
const SONG = { titulo: 'Something Comforting (Live at Second Sky Festival, Oakland 2021)', artista: 'Porter Robinson & Madeon' }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
const errors = []
try {
	// Un token equivocado no entra.
	await assert.rejects(openDock('f'.repeat(64)))
	log('dock con token malo: rechazado')

	const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
	assert.equal((await teacher.request.post('/api/portal/login', { data: { username: 'leo', password: 'qa-teacher-password-only-local' } })).status(), 200)
	assert.equal((await teacher.request.post('/api/obs/capitulo', { data: { capitulo: 1 } })).status(), 409)
	log('POST maestro sin dock: 409')
	const board = await (await teacher.request.post('/api/boards', { data: { name: 'Clase OBS QA' } })).json()

	const username = `Q${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
	assert.equal((await teacher.request.post('/api/portal/students', { data: { students: [{ username, name: 'Dana' }] } })).status(), 201)
	const studentId = (await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.username === username).id
	const student = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
	assert.equal((await student.request.post('/api/portal/login', { data: { username, password: username } })).status(), 200)
	assert.equal((await student.request.post('/api/portal/password', { data: { password: 'qa-obs-password' } })).status(), 200)
	const pass = await (await student.request.get('/api/portal/pass')).json()
	assert.equal((await student.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, step: 4, opened: true, signature: { kind: 'drawn', strokes: [[[20, 100], [100, 45], [160, 220]]] } }, revision: pass.revision, completed: true } })).status(), 200)
	assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: [{ kind: 'user', subjectId: studentId }] } })).status(), 200)
	assert.equal((await student.request.post('/api/obs/capitulo', { data: { capitulo: 1 } })).status(), 403)
	log('POST alumno: 403')

	// Leo dibuja sus bloques como en clase: rectángulo, título suelto y tarjetas dentro.
	const teacherPage = await teacher.newPage()
	teacherPage.on('pageerror', (error) => errors.push(error.message))
	await teacherPage.goto(`/board/${board.id}`)
	await teacherPage.waitForFunction(() => !!window.__xpCanvasEditor)
	await teacherPage.evaluate(() => {
		const editor = window.__xpCanvasEditor
		const rich = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
		const block = (y, title, cards, steps = []) => {
			editor.createShape({ type: 'geo', x: 0, y, props: { geo: 'rectangle', w: 820, h: 250, color: 'black', size: 's' } })
			editor.createShape({ type: 'text', x: 28, y: y + 26, props: { richText: rich(title), size: 'l', font: 'draw' } })
			steps.forEach((step, i) => editor.createShape({ type: 'text', x: 28, y: y + 100 + i * 50, props: { richText: rich(step), size: 's', font: 'draw' } }))
			cards.forEach(([head, sub], i) => editor.createShape({ type: 'geo', x: 28 + i * 395, y: y + 100, props: { geo: 'rectangle', w: 365, h: 125, color: 'blue', fill: 'semi', size: 's', font: 'draw', align: 'start', verticalAlign: 'start', richText: rich(`${head}\n${sub}`) } }))
		}
		block(0, '1 · haz el primer paso de tu plan', [['pídeselo a Codex', 'el paso 1 de tu plan, sin skill'], ['juega', '¿pasó lo que dice tu para comprobar?']])
		block(320, '2 · revisa qué cambió', [['lee el diff', 'qué archivos tocó'], ['pregunta', '¿por qué así?']])
		// A numbered list inside a block, like Leo's «4 · en orden»: its steps are content, not chapters.
		block(640, '3 · comparte', [], ['1 · sube tu juego', '2 · pide que lo prueben'])
		editor.zoomToFit({ animation: { duration: 0 } })
	})
	await teacherPage.waitForTimeout(800)

	const studentPage = await student.newPage()
	studentPage.on('pageerror', (error) => errors.push(error.message))
	await studentPage.goto(`/board/${board.id}`)
	await studentPage.waitForFunction(() => window.__xpCanvasEditor?.getCurrentPageShapes().length >= 8)
	await studentPage.evaluate(() => { window.__xpCanvasEditor.zoomToFit({ animation: { duration: 0 } }) })
	// The raw stream a student receives, next to what the page shows.
	await studentPage.evaluate(() => {
		window.__obsMessages = []
		new WebSocket(new URL('/api/obs/estado', location.href.replace(/^http/, 'ws'))).onmessage = (event) => window.__obsMessages.push(event.data)
	})
	await teacherPage.screenshot({ path: `${shots}/maestro-mac-sin-obs.png` })
	// The song sits in the header's free space: same header height, and never over the title or the buttons.
	const header = (page) => page.evaluate(() => {
		const box = (selector) => { const rect = document.querySelector(selector)?.getBoundingClientRect(); return rect && rect.width ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null }
		return { height: document.querySelector('.canvas-header').getBoundingClientRect().height, bar: box('.canvas-header'), identity: box('.canvas-identity'), song: box('.obs-song'), actions: box('.canvas-actions') }
	})
	const sizes = { mac: { width: 1440, height: 900 }, ipad: { width: 1180, height: 820 }, 'ipad-vertical': { width: 820, height: 1180 }, movil: { width: 390, height: 844 } }
	const heights = {}
	for (const [name, size] of Object.entries(sizes)) for (const [who, page] of [['maestro', teacherPage], ['alumno', studentPage]]) {
		await page.setViewportSize(size)
		heights[`${who}-${name}`] = (await header(page)).height
	}
	for (const page of [teacherPage, studentPage]) await page.setViewportSize(sizes.mac)

	const dock = await openDock(TOKEN)
	log('dock con token bueno: conectado, subprotocolo =', JSON.stringify(dock.socket.protocol))
	dock.socket.send(JSON.stringify(estado(1, SONG)))
	await studentPage.locator('.obs-song').waitFor()
	await studentPage.waitForFunction(() => window.__obsMessages.some((message) => message.includes('Something Comforting')))
	log('alumno recibe:', (await studentPage.evaluate(() => window.__obsMessages)).join('\n               '))
	assert.equal(await studentPage.locator('.obs-chapter').count(), 0, 'students never see chapter buttons')
	assert.match(await studentPage.locator('.obs-song').innerText(), /Something Comforting[\s\S]*Porter Robinson/)

	await teacherPage.locator('.obs-chapter[data-live]').waitFor()
	log('botones del maestro:', await teacherPage.locator('.obs-chapter').allInnerTexts())
	await teacherPage.locator('.obs-chapter:not([disabled])', { hasText: '2 ·' }).click()
	for (let i = 0; i < 50 && !dock.received.some((message) => message.tipo === 'ir_a'); i++) await wait(100)
	assert.deepEqual(dock.received.at(-1), { tipo: 'ir_a', capitulo: 2 })
	dock.socket.send(JSON.stringify(estado(2, SONG)))
	await teacherPage.locator('.obs-chapter[data-live]', { hasText: 'Primer paso' }).waitFor()
	// The live block's border turns orange for Leo only, and its pill drops the dot.
	await teacherPage.locator('.obs-border:not([data-leaving])').waitFor()
	assert.equal(await teacherPage.locator('.obs-border:not([data-leaving])').count(), 1)
	assert.equal(await teacherPage.locator('.obs-chapter[data-live] .obs-chapter__dot').count(), 0)
	assert.equal(await studentPage.locator('.obs-border').count(), 0, 'students never see the live border')
	log('después del clic:', await teacherPage.locator('.obs-chapter').allInnerTexts())

	for (const [name, size] of Object.entries(sizes)) {
		for (const [who, page] of [['maestro', teacherPage], ['alumno', studentPage]]) {
			await page.setViewportSize(size)
			await page.evaluate(() => { window.__xpCanvasEditor.zoomToFit({ animation: { duration: 0 } }) })
			await page.waitForTimeout(400)
			const layout = await header(page)
			assert.equal(layout.height, heights[`${who}-${name}`], `${who} ${name}: the song does not change the header height`)
			if (layout.song) {
				assert.ok(layout.song.top >= layout.bar.top && layout.song.bottom <= layout.bar.bottom, `${who} ${name}: song inside the bar`)
				const sameRow = layout.song.top < layout.identity.bottom && layout.song.bottom > layout.identity.top
				assert.ok(!sameRow || layout.song.left >= layout.identity.right, `${who} ${name}: song clear of the title`)
				assert.ok(layout.song.right <= layout.actions.left, `${who} ${name}: song clear of the buttons`)
			}
			const shown = await page.locator('.obs-song').evaluate((card) => [...card.querySelectorAll('.obs-song__cover, .obs-song__artist, .obs-song__bars')].filter((part) => getComputedStyle(part).display !== 'none').map((part) => part.className.replace('obs-song__', '').split(' ')[0])).catch(() => null)
			log(`${who} ${name}: barra ${layout.height}px, canción ${layout.song ? `${Math.round(layout.song.right - layout.song.left)}px con ${shown.join(', ') || 'solo el título'}` : 'escondida, no cabe'}`)
			await page.screenshot({ path: `${shots}/${who}-${name}.png` })
		}
	}

	// One button per block, pinned to its own top-right corner even when the block runs off screen.
	const corners = () => teacherPage.evaluate(() => {
		const editor = window.__xpCanvasEditor
		const blocks = editor.getCurrentPageShapes().filter((shape) => shape.type === 'geo' && shape.props.color === 'black')
		return { buttons: [...document.querySelectorAll('.obs-chapter')].map((button) => Math.round(button.getBoundingClientRect().right + 10)).sort(), blocks: blocks.map((shape) => { const bounds = editor.getShapePageBounds(shape); return Math.round(editor.pageToScreen({ x: bounds.maxX, y: bounds.y }).x) }).sort() }
	})
	await teacherPage.setViewportSize(sizes['ipad-vertical'])
	await teacherPage.evaluate(() => { window.__xpCanvasEditor.zoomToFit({ animation: { duration: 0 } }) })
	await teacherPage.evaluate(() => { const editor = window.__xpCanvasEditor; editor.setCamera({ ...editor.getCamera(), x: editor.getCamera().x + 260 }, { animation: { duration: 0 } }) })
	await teacherPage.waitForTimeout(300)
	await teacherPage.screenshot({ path: `${shots}/maestro-ipad-vertical-bloque-cortado.png` })
	const cut = await corners()
	log('bloque cortado, borde derecho de botones y bloques:', JSON.stringify(cut))
	assert.deepEqual(cut.buttons, cut.blocks, 'each button stays on its block corner, even past the screen edge')
	await teacherPage.setViewportSize(sizes.mac)
	// Zoomed out the buttons leave, and come back without leftovers.
	await teacherPage.evaluate(() => { const editor = window.__xpCanvasEditor; editor.setCamera({ ...editor.getCamera(), z: 0.1 }, { animation: { duration: 0 } }) })
	await teacherPage.waitForTimeout(300)
	assert.equal(await teacherPage.locator('.obs-chapter').count(), 0)
	await teacherPage.evaluate(() => { window.__xpCanvasEditor.zoomToFit({ animation: { duration: 0 } }) })
	await teacherPage.waitForTimeout(300)
	await teacherPage.screenshot({ path: `${shots}/maestro-mac-tras-alejar.png` })
	const fit = await corners()
	assert.deepEqual(fit.buttons, fit.blocks, 'three blocks, three buttons, after zooming back in')
	dock.socket.close()
	await studentPage.locator('.obs-song').waitFor({ state: 'detached' })
	await teacherPage.locator('.obs-chapter[data-offline]').first().waitFor()
	await teacherPage.waitForTimeout(300)
	log('dock desconectado, alumno recibe:', (await studentPage.evaluate(() => window.__obsMessages.at(-1))))
	log('botones del maestro:', await teacherPage.locator('.obs-chapter').allInnerTexts())
	await teacherPage.screenshot({ path: `${shots}/maestro-mac-obs-desconectado.png` })
	assert.equal((await teacher.request.post('/api/obs/capitulo', { data: { capitulo: 1 } })).status(), 409)
	assert.deepEqual(errors, [])
	log(`OK. Capturas en ${shots}`)
} finally {
	await browser.close()
}
