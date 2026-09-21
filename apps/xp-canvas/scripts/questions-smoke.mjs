import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Creates synthetic accounts and documents. Use an isolated portal QA server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5189'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Questions smoke requires localhost and isolated QA state.')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
const errors = []
try {
	const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
	assert.equal((await teacher.request.post('/api/portal/login', { data: { username: 'leo', password: process.env.PORTAL_QA_PASSWORD ?? 'qa-teacher-password-only-local' } })).status(), 200)
	const board = await (await teacher.request.post('/api/boards', { data: { name: 'Preguntas QA' } })).json()
	const privateBoard = await (await teacher.request.post('/api/boards', { data: { name: 'Privado QA' } })).json()
	const students = []
	for (const [index, name] of ['Ana Preguntas', 'Luis Preguntas'].entries()) {
		const username = `Q${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
		assert.equal((await teacher.request.post('/api/portal/students', { data: { students: [{ username, name }] } })).status(), 201)
		const roster = await (await teacher.request.get('/api/portal/roster')).json()
		const id = roster.students.find((s) => s.username === username).id
		const context = await browser.newContext({ baseURL, ...(index === 0 ? devices['iPad Pro 11 landscape'] : {}) })
		await context.addInitScript(() => {
			window.__questionAcks = 0
			const Original = window.WebSocket
			window.WebSocket = new Proxy(Original, { construct(Target, args) {
				const socket = new Target(...args), send = socket.send.bind(socket)
				socket.addEventListener('message', (event) => { if (String(event.data).includes('push_result')) window.__questionAcks++ })
				socket.send = (raw) => {
					let data
					try { data = JSON.parse(raw) } catch { return send(raw) }
					if (data.type === 'push' && data.presence && window.__questionForge) {
						data.diff = { [window.__questionForge.id]: ['put', window.__questionForge] }
						window.__questionForge = null
						return send(JSON.stringify(data))
					}
					return send(raw)
				}
				return socket
			} })
		})
		assert.equal((await context.request.post('/api/portal/login', { data: { username, password: username } })).status(), 200)
		assert.equal((await context.request.post('/api/portal/password', { data: { password: 'qa-questions-password' } })).status(), 200)
		const pass = await (await context.request.get('/api/portal/pass')).json()
		assert.equal((await context.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, step: 4, opened: true, signature: { kind: 'drawn', strokes: [[[20, 100], [100, 45], [160, 220]]] } }, revision: pass.revision, completed: true } })).status(), 200)
		students.push({ context, id, name })
	}
	assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: students.map(({ id }) => ({ kind: 'user', subjectId: id })) } })).status(), 200)
	for (const actor of [{ context: teacher }, ...students]) {
		actor.page = await actor.context.newPage()
		await actor.page.addInitScript(() => {
			window.__questionAnimations = []
			window.__questionSounds = []
			const start = AudioBufferSourceNode.prototype.start
			AudioBufferSourceNode.prototype.start = function (...args) {
				window.__questionSounds.push({ duration: this.buffer?.duration, when: args[0] ?? 0, state: this.context.state, audible: this.buffer?.getChannelData(0).some((sample) => Math.abs(sample) > .001) })
				return start.apply(this, args)
			}
			const animate = Element.prototype.animate
			Element.prototype.animate = function (frames, options) {
				if (this.classList.contains('question-answer')) window.__questionAnimations.push({ frames, options })
				return animate.call(this, frames, options)
			}
		})
		actor.page.on('pageerror', (error) => errors.push(error.message))
		await actor.page.goto(`/board/${board.id}`)
		await actor.page.waitForFunction(() => !!window.__xpCanvasEditor)
		if (actor.context === teacher) teacher.page = actor.page
	}
	const manager = teacher.page, ana = students[0], luis = students[1]
	await luis.page.locator('.tl-background').click({ position: { x: 180, y: 180 } })
	await manager.getByRole('button', { name: 'Pregunta', exact: true }).click()
	const dialog = manager.getByRole('dialog')
	await dialog.getByLabel('Pregunta', { exact: true }).fill('¿Cuánto es 2 + 2?')
	for (const [index, label] of ['3', '4', '5', '6'].entries()) await dialog.getByLabel(`Respuesta ${'ABCD'[index]}`, { exact: true }).fill(label)
	await dialog.getByRole('radio', { name: 'La respuesta B es correcta', exact: true }).check()
	await dialog.getByRole('button', { name: 'Añadir al canvas', exact: true }).click()
	await dialog.waitFor({ state: 'hidden' })
	await ana.page.locator('.question-card').waitFor()
	await luis.page.locator('.question-card').waitFor()
	assert.equal(await ana.page.locator('.question-answer:enabled').count(), 0)
	assert.equal(await ana.page.getByTestId('tools.select').isDisabled(), true)
	assert.equal(await manager.getByRole('button', { name: 'Editar pregunta', exact: true }).innerText(), '')
	assert.equal(await ana.page.locator('.question-card__hint, .question-card__heading').count(), 0)
	let shape = await manager.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().find((shape) => shape.type === 'question'))
	const endpoint = `/api/boards/${board.id}/interactions`
	const answer = (context, value, revision = shape.props.revision) => context.request.post(endpoint, { data: { action: 'answer', shapeId: shape.id, revision, answer: value } })
	assert.equal((await answer(ana.context, 0)).status(), 403, 'server denies answers without permission')
	assert.equal((await ana.context.request.post(endpoint, { data: { action: 'permission', userId: ana.id, allowed: true } })).status(), 403, 'student cannot grant permission')
	assert.equal((await ana.context.request.get(`/api/boards/${privateBoard.id}/interactions`)).status(), 404, 'private board remains hidden')
	for (const page of [manager, ana.page, luis.page]) assert.equal(await page.evaluate(() => window.__questionSounds.length), 0, 'loading and rejected answers stay silent')
	await ana.page.getByRole('button', { name: 'Levantar la mano', exact: true }).tap()
	const row = manager.locator('.connected-students li').filter({ hasText: ana.name })
	await row.getByLabel('Mano levantada', { exact: true }).waitFor()
	await row.getByRole('button', { name: 'Permitir responder', exact: true }).click()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 4)
	assert.equal(await ana.page.evaluate(() => window.__xpCanvasEditor.getCurrentToolId()), 'select')
	assert.equal(await ana.page.getByTestId('tools.select').isEnabled(), true)
	await ana.page.getByTestId('tools.hand').tap()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 0)
	await ana.page.getByTestId('tools.select').tap()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 4)
	assert.equal(await luis.page.locator('.question-answer:enabled').count(), 0, 'only chosen student can answer')
	await luis.page.emulateMedia({ reducedMotion: 'reduce' })
	await ana.page.locator('.question-answer').nth(0).tap()
	for (const page of [manager, ana.page, luis.page]) await page.locator('.question-answer[data-result="incorrect"]').waitFor()
	for (const page of [manager, ana.page, luis.page]) {
		await page.waitForFunction(() => window.__questionAnimations.length === 1 && window.__questionSounds.length === 1)
		const sound = await page.evaluate(() => window.__questionSounds[0])
		assert(sound.duration > .4 && sound.duration < .7 && sound.audible && sound.state === 'running', 'wrong-answer file plays on each client')
		assert.equal(await page.locator('.question-celebration').count(), 0, 'incorrect answers do not celebrate')
	}
	assert((await manager.evaluate(() => window.__questionAnimations[0].frames)).some((frame) => frame.transform === 'translateX(-8px)'))
	assert((await luis.page.evaluate(() => window.__questionAnimations[0].frames)).every((frame) => !frame.transform), 'reduced motion does not shake')
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 3)
	await ana.page.locator('.question-answer').nth(1).tap()
	for (const page of [manager, ana.page, luis.page]) await page.locator('.question-answer[data-result="correct"]').waitFor()
	const celebrationIds = []
	for (const page of [manager, ana.page, luis.page]) {
		await page.locator('.question-celebration').waitFor()
		celebrationIds.push(await page.locator('.question-celebration').getAttribute('data-celebration-id'))
		await page.waitForFunction(() => window.__questionAnimations.length === 2 && window.__questionSounds.length === 4)
		const sequence = await page.evaluate(() => window.__questionSounds.slice(1))
		assert(sequence.every((sound) => sound.audible && sound.state === 'running'), 'correct sequence uses decoded audio on every client')
		assert(sequence[0].duration > 1.1 && sequence[0].duration < 1.4)
		assert(sequence[1].duration > 4.5 && sequence[1].duration < 5)
		assert(sequence[2].duration > 1.6 && sequence[2].duration < 1.9)
		assert(sequence.every((sound) => sound.when === sequence[0].when), 'all correct sounds start together')
	}
	assert.equal(new Set(celebrationIds).size, 1, 'one server-confirmed celebration reaches all clients')
	assert((await manager.evaluate(() => window.__questionAnimations[1].frames)).some((frame) => frame.transform === 'scale(1.045)'))
	assert((await luis.page.evaluate(() => window.__questionAnimations[1].frames)).every((frame) => !frame.transform))
	assert.equal(await luis.page.locator('.question-celebration__particle').first().isVisible(), false)
	await luis.page.locator('.question-celebration__reduced').waitFor()
	await luis.page.screenshot({ path: '/tmp/xp-canvas-celebration-reduced.png' })
	await manager.evaluate(() => {
		for (const animation of document.getAnimations()) if (animation.effect?.target?.closest?.('.question-celebration')) { animation.pause(); animation.currentTime = 550 }
	})
	await manager.screenshot({ path: '/tmp/xp-canvas-celebration-falling.png' })
	await manager.evaluate(() => {
		for (const animation of document.getAnimations()) if (animation.effect?.target?.closest?.('.question-celebration')) animation.currentTime = 1800
	})
	assert(await manager.locator('.question-celebration__particle').evaluateAll((particles) => particles.reduce((sum, particle) => sum + particle.getBoundingClientRect().top, 0) / particles.length > window.innerHeight * .75), 'particles accumulate along the bottom')
	await manager.screenshot({ path: '/tmp/xp-canvas-celebration-pile.png' })
	await manager.evaluate(() => {
		for (const animation of document.getAnimations()) if (animation.effect?.target?.classList?.contains('question-celebration')) animation.currentTime = 3175
	})
	const opacity = await manager.locator('.question-celebration').evaluate((el) => Number(getComputedStyle(el).opacity))
	assert(opacity > 0 && opacity < 1, 'celebration fades after three seconds')
	for (const page of [manager, ana.page, luis.page]) await page.locator('.question-celebration').waitFor({ state: 'detached' })
	await luis.page.emulateMedia({ reducedMotion: 'no-preference' })
	assert.equal((await answer(ana.context, 1)).status(), 409, 'duplicate answer rejected')
	assert.equal((await answer(luis.context, 2)).status(), 403)
	assert.equal((await ana.context.request.post(endpoint, { data: { action: 'answer', shapeId: shape.id, revision: shape.props.revision, answer: 99 } })).status(), 400)
	// Permission persists across reload, and never changes tldraw's readonly role.
	await ana.page.reload(); await ana.page.waitForFunction(() => !!window.__xpCanvasEditor && document.querySelectorAll('.question-answer:enabled').length === 2)
	assert.equal(await ana.page.evaluate(() => window.__xpCanvasEditor.getIsReadonly()), true)
	assert.equal(await ana.page.locator('.question-celebration').count(), 0, 'reloading old correct answers does not replay celebrations')
	assert.equal(await ana.page.evaluate(() => window.__questionAnimations.length), 0)
	assert.equal(await ana.page.evaluate(() => window.__questionSounds.length), 0, 'reloading never replays audio')
	const acknowledgements = await ana.page.evaluate((shape) => { window.__questionForge = { ...shape, props: { ...shape.props, correct: 3, answered: [3] } }; return window.__questionAcks }, shape)
	await ana.page.mouse.move(320, 220)
	await ana.page.waitForFunction((acks) => !window.__questionForge && window.__questionAcks > acks, acknowledgements)
	assert.equal(await manager.evaluate((id) => window.__xpCanvasEditor.getShape(id).props.correct, shape.id), 1, 'permission never allows direct document writes')
	const secondTab = await ana.context.newPage()
	await secondTab.goto(`/board/${board.id}`)
	await secondTab.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 2)
	await row.getByRole('button', { name: 'Retirar permiso', exact: true }).click()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 0)
	assert.equal((await answer(ana.context, 2)).status(), 403, 'revocation enforced server-side')
	await secondTab.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 0)
	assert.equal(await ana.page.getByTestId('tools.select').isDisabled(), true)
	assert.equal(await ana.page.evaluate(() => window.__xpCanvasEditor.getCurrentToolId()), 'hand')
	await secondTab.close()
	await manager.getByRole('button', { name: 'Editar pregunta', exact: true }).click()
	await manager.getByRole('button', { name: 'Reiniciar respuestas', exact: true }).click()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer[data-result="none"]').length === 4)
	await row.getByRole('button', { name: 'Permitir responder', exact: true }).click()
	assert.equal((await answer(ana.context, 0)).status(), 409, 'stale answers rejected after reset')
	shape = await manager.evaluate(() => window.__xpCanvasEditor.getCurrentPageShapes().find((shape) => shape.type === 'question'))
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 4)
	await ana.page.locator('.question-answer').nth(1).tap()
	await manager.locator('.question-answer[data-result="correct"]').waitFor()
	const luisRow = manager.locator('.connected-students li').filter({ hasText: luis.name })
	const desktopAnswer = luis.page.locator('.question-answer').nth(0)
	const beforeHover = await desktopAnswer.evaluate((el) => getComputedStyle(el).backgroundColor)
	const answerBounds = await desktopAnswer.boundingBox()
	await luis.page.mouse.move(answerBounds.x + answerBounds.width / 2, answerBounds.y + answerBounds.height / 2)
	assert.equal(await desktopAnswer.evaluate((el) => getComputedStyle(el).backgroundColor), beforeHover, 'blocked answers do not highlight')
	await luisRow.getByRole('button', { name: 'Permitir responder', exact: true }).click()
	await luis.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 3)
	await desktopAnswer.hover()
	assert.notEqual(await desktopAnswer.evaluate((el) => getComputedStyle(el).backgroundColor), beforeHover, 'permitted cursor highlights hovered answer')
	assert.equal(await desktopAnswer.getAttribute('data-result'), 'none', 'hover never submits an answer')
	await luis.page.screenshot({ path: '/tmp/xp-canvas-questions-hover.png' })
	await manager.screenshot({ path: '/tmp/xp-canvas-questions-teacher.png' })
	await ana.page.screenshot({ path: '/tmp/xp-canvas-questions-student.png' })
	for (const page of [manager, ana.page]) { const size = await page.locator('.question-card').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight })); assert(size.scroll <= size.client + 1, `question text does not clip: ${JSON.stringify(size)}`) }
	assert.deepEqual(errors, [])
	console.log('PASS: teacher authoring, hand raise, individual permission, persistent permission, confirmed correct/incorrect audio on all clients, shared results and celebration events, button bounce/shake, confetti pile and fade, reduced motion, no replay after reload, reset, stale answer rejection and server access checks. Touch tested in Chromium emulation only.')
} finally { await browser.close() }
