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
		students.push({ context, id, name, username })
	}
	assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: students.map(({ id }) => ({ kind: 'user', subjectId: id })) } })).status(), 200)
	for (const actor of [{ context: teacher }, ...students]) {
		actor.page = await actor.context.newPage()
		await actor.page.addInitScript(() => {
			window.__drawSounds = []
			const oscillatorStart = OscillatorNode.prototype.start
			OscillatorNode.prototype.start = function (...args) {
				window.__drawSounds.push({ at: performance.now(), frequency: this.frequency.value, state: this.context.state })
				return oscillatorStart.apply(this, args)
			}
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
	assert.equal(await dialog.getByLabel('Puntos por respuesta correcta', { exact: true }).inputValue(), '100')
	await dialog.getByLabel('Puntos por respuesta correcta', { exact: true }).fill('175')
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
	const points = async (context) => (await (await context.request.get('/api/portal/points')).json()).points
	assert.equal(await points(ana.context), 0, 'new students begin at zero')
	assert.equal(await points(luis.context), 0)
	assert.equal((await ana.context.request.get('/api/portal/roster')).status(), 403, 'student cannot read classmates balances')
	assert.equal((await ana.context.request.post('/api/portal/points', { data: { points: 9000 } })).status(), 403, 'student cannot award points directly')
	const answer = (context, value, revision = shape.props.revision) => context.request.post(endpoint, { data: { action: 'answer', shapeId: shape.id, revision, answer: value, points: 999999 } })
	assert.equal((await answer(ana.context, 0)).status(), 403, 'server denies answers without permission')
	assert.equal((await ana.context.request.post(endpoint, { data: { action: 'permission', userId: ana.id, allowed: true } })).status(), 403, 'student cannot grant permission')
	assert.equal((await ana.context.request.get(`/api/boards/${privateBoard.id}/interactions`)).status(), 404, 'private board remains hidden')
	for (const page of [manager, ana.page, luis.page]) assert.equal(await page.evaluate(() => window.__questionSounds.length), 0, 'loading and rejected answers stay silent')
	await ana.page.getByRole('button', { name: 'Levantar la mano', exact: true }).tap()
	const row = manager.locator('.connected-students li').filter({ hasText: ana.name })
	await row.getByLabel('Mano levantada', { exact: true }).waitFor()
	for (const page of [manager, ana.page, luis.page]) {
		await page.waitForFunction(() => document.querySelectorAll('.connected-students li').length === 2)
		assert.equal(await page.locator('.connected-students__count').innerText(), '2', 'same roster includes the viewing student')
		await page.locator('.connected-students li').filter({ hasText: ana.name }).getByLabel('Mano levantada', { exact: true }).waitFor()
	}
	for (const page of [ana.page, luis.page]) {
		assert.equal(await page.locator('.tlui-share-zone').count(), 0, 'student avatar popup is removed')
		assert.equal(await page.getByRole('button', { name: 'Sortear alumno', exact: true }).count(), 0)
		assert.equal(await page.locator('.connected-students__permission').count(), 0, 'student sidebar has no permission controls')
	}
	assert.equal((await ana.context.request.post(endpoint, { data: { action: 'draw' } })).status(), 403, 'students cannot initiate a draw')
	await row.getByRole('button', { name: 'Permitir responder', exact: true }).click()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 4)
	assert.equal(await ana.page.evaluate(() => window.__xpCanvasEditor.getCurrentToolId()), 'select')
	assert.equal(await ana.page.getByTestId('tools.select').isEnabled(), true)
	await ana.page.getByTestId('tools.hand').tap()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 0)
	await ana.page.getByTestId('tools.select').tap()
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 4)
	assert.equal(await luis.page.locator('.question-answer:enabled').count(), 0, 'only chosen student can answer')
	for (const page of [manager, ana.page, luis.page]) await page.locator(`.connected-students li[data-user-id="${ana.id}"][data-control="true"]`).waitFor()
	await luis.page.locator('.connected-students li').filter({ hasText: ana.name }).getByLabel('Tiene control', { exact: true }).waitFor()
	assert.notEqual(await row.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'permission highlights the entire row')
	await luis.page.emulateMedia({ reducedMotion: 'reduce' })
	await ana.page.locator('.question-answer').nth(0).tap()
	for (const page of [manager, ana.page, luis.page]) await page.locator('.question-answer[data-result="incorrect"]').waitFor()
	for (const page of [manager, ana.page, luis.page]) {
		await page.waitForFunction(() => window.__questionAnimations.length === 1 && window.__questionSounds.length === 1)
		const sound = await page.evaluate(() => window.__questionSounds[0])
		assert(sound.duration > .4 && sound.duration < .7 && sound.audible && sound.state === 'running', 'wrong-answer file plays on each client')
		assert.equal(await page.locator('.question-celebration').count(), 0, 'incorrect answers do not celebrate')
	}
	assert.equal(await points(ana.context), 0, 'wrong answers earn no points')
	assert.equal(await manager.locator('.question-points').count(), 0)
	assert((await manager.evaluate(() => window.__questionAnimations[0].frames)).some((frame) => frame.transform === 'translateX(-8px)'))
	assert((await luis.page.evaluate(() => window.__questionAnimations[0].frames)).every((frame) => !frame.transform), 'reduced motion does not shake')
	await ana.page.waitForFunction(() => document.querySelectorAll('.question-answer:enabled').length === 3)
	await ana.page.locator('.question-answer').nth(1).tap()
	for (const page of [manager, ana.page, luis.page]) await page.locator('.question-answer[data-result="correct"]').waitFor()
	assert.equal(await points(ana.context), 175, 'the configured reward goes to the student who answered')
	assert.equal(await points(luis.context), 0, 'other students receive no points')
	for (const page of [manager, ana.page, luis.page]) {
		await page.getByLabel('175 puntos ganados', { exact: true }).waitFor()
		assert.equal(await page.locator('.question-points').innerText(), '+175')
		const popup = await page.locator('.question-points').boundingBox(), card = await page.locator('.question-card').boundingBox()
		assert(popup.y + popup.height < card.y, 'the reward appears above the question')
	}
	await manager.screenshot({ path: '/tmp/xp-canvas-points-reward.png' })
	assert.equal((await answer(ana.context, 1)).status(), 409, 'repeated correct submissions are rejected')
	assert.equal(await points(ana.context), 175)
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
	for (const page of [manager, ana.page, luis.page, secondTab]) await page.locator(`.connected-students li[data-user-id="${ana.id}"][data-control="false"]`).waitFor()
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
	// One shared draw, with a reduced-motion view and no permission side effects.
	await luis.page.emulateMedia({ reducedMotion: 'reduce' })
	const permissionsBefore = (await (await teacher.request.get(endpoint)).json()).allowedUserIds.sort()
	await ana.page.locator('.tl-background').tap({ position: { x: 80, y: 80 } })
	await manager.getByRole('button', { name: 'Sortear alumno', exact: true }).click()
	await manager.getByRole('status').filter({ hasText: 'Sorteando…' }).waitFor()
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'draw' } })).status(), 409, 'overlapping draws are rejected')
	await manager.waitForFunction(() => window.__drawSounds.length >= 4)
	assert.equal(await luis.page.locator('[data-draw-active="true"]').count(), 0, 'reduced motion skips the cycling highlight')
	await manager.screenshot({ path: '/tmp/xp-canvas-student-draw-running.png' })
	const winners = []
	for (const page of [manager, ana.page, luis.page]) {
		await page.locator('[data-draw-selected="true"]').waitFor()
		winners.push(await page.locator('[data-draw-selected="true"]').getAttribute('data-user-id'))
		const beats = await page.evaluate(() => window.__drawSounds)
		assert(beats.length >= 20 && beats.every((beat) => beat.state === 'running'), 'draw ticks are audible on every unlocked client')
		assert(beats.at(-1).frequency > beats[0].frequency, 'the winner gets a distinct final tone')
		assert(beats.at(-1).at - beats.at(-2).at > (beats[1].at - beats[0].at) * 3, 'tick intervals slow before the winner')
	}
	assert.equal(new Set(winners).size, 1, 'all clients choose the same student')
	assert(students.some((student) => student.id === winners[0]), 'winner is a connected student')
	assert.deepEqual((await (await teacher.request.get(endpoint)).json()).allowedUserIds.sort(), permissionsBefore, 'drawing does not grant control')
	await manager.screenshot({ path: '/tmp/xp-canvas-student-draw-teacher.png' })
	await ana.page.screenshot({ path: '/tmp/xp-canvas-student-draw-student.png' })
	await ana.page.reload()
	await ana.page.locator('.connected-students li').first().waitFor()
	assert.equal(await ana.page.locator('[data-draw-selected="true"]').count(), 0, 'reconnecting does not replay a draw')
	assert.equal(await ana.page.evaluate(() => window.__drawSounds.length), 0)
	assert.equal(await points(ana.context), 350, 'a new teacher-started revision can award points again')
	assert.equal(await points(luis.context), 0)
	assert.deepEqual(await (await luis.context.request.get(`/api/portal/points?userId=${ana.id}`)).json(), { points: 0 }, 'a user ID parameter never exposes another balance')
	assert.equal((await (await ana.context.request.get('/api/portal/session')).json()).user.points, undefined, 'balance is absent from general session data')
	assert.equal(await manager.locator('.connected-students__chosen').count(), 0, 'draw keeps no selected subtitle')
	assert.equal((await manager.locator('.connected-students__draw-status').innerText()).trim(), '', 'draw keeps no result sentence')
	// Restoring the document's unanswered state cannot pay the same activity twice.
	await manager.evaluate(() => {
		const editor = window.__xpCanvasEditor, question = editor.getCurrentPageShapes().find((shape) => shape.type === 'question')
		editor.updateShape({ id: question.id, type: 'question', props: { answered: question.props.answered.filter((answer) => answer !== question.props.correct) } })
	})
	await luis.page.locator('.question-answer[data-result="correct"]').waitFor({ state: 'hidden' })
	assert.equal((await answer(luis.context, 1)).status(), 200)
	assert.equal(await points(luis.context), 0, 'undo cannot transfer or duplicate an existing award')
	assert.equal(await points(ana.context), 350)
	const profilePage = await ana.context.newPage()
	await profilePage.goto('/perfil')
	await profilePage.getByTestId('profile-points').filter({ hasText: '350' }).waitFor()
	await profilePage.screenshot({ path: '/tmp/xp-canvas-points-profile.png' })
	const rosterPage = await teacher.newPage()
	await rosterPage.goto('/alumnos')
	await rosterPage.locator('.portal-student').filter({ hasText: ana.username }).locator('.student-points').filter({ hasText: '350 puntos' }).waitFor()
	assert.deepEqual(errors, [])
	console.log('PASS: teacher authoring, hand raise, individual permission, persistent permission, private point balances, configurable awards, public reward popup, no duplicate awards after retry or undo, shared student sidebar and control indicators, synchronized random draw with decelerating audio, teacher-only draw and overlap rejection, confirmed correct/incorrect audio on all clients, shared results and celebration events, button bounce/shake, confetti pile and fade, reduced motion, no replay after reload, reset, stale answer rejection and server access checks. Touch tested in Chromium emulation only.')
} finally { await browser.close() }
