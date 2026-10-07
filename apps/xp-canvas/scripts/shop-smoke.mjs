import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Creates synthetic accounts and documents. Use an isolated portal QA server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Shop smoke requires localhost and isolated QA state.')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
const errors = []
const REWARD_SKINS = ['arcane-knight', 'moon-magic', 'sunset-riders', 'lunar-witch', 'golden-warrior', 'starlight-duo', 'zelda-campfire', 'tracer', 'soraka', 'shadow-warrior', 'luke', 'attack-titan', 'rengoku', 'gyro', 'emilia']
const TICKET_LINE = '¡Repasa los conceptos de clase y gana una tirada! :)'
const FREE_LINE = 'Felicidades! Reclama tu tirada gratis! :)'
const LATER_LINE = 'Vuelve mañana por otra tirada!'
const QUESTIONS = [
	['¿Cuánto es 2 + 2?', ['3', '4', '5', '6'], 1],
	['¿Qué color resulta de azul y amarillo?', ['Verde', 'Rojo', 'Morado', 'Gris'], 0],
	['¿Cuántos lados tiene un hexágono?', ['Cinco', 'Ocho', 'Seis', 'Siete'], 2],
	['¿Qué planeta es el más grande?', ['Marte', 'Venus', 'Tierra', 'Júpiter'], 3],
	['¿Qué capital tiene México?', ['Ciudad de México', 'Monterrey', 'Puebla', 'Mérida'], 0],
]
try {
	const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
	assert.equal((await teacher.request.post('/api/portal/login', { data: { username: 'leo', password: process.env.PORTAL_QA_PASSWORD ?? 'qa-teacher-password-only-local' } })).status(), 200)
	const board = await (await teacher.request.post('/api/boards', { data: { name: 'Tienda QA' } })).json()
	const username = `Q${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`, name = 'Ana Tienda'
	assert.equal((await teacher.request.post('/api/portal/students', { data: { students: [{ username, name }] } })).status(), 201)
	const id = (await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.username === username).id
	const ana = await browser.newContext({ baseURL, viewport: { width: 1360, height: 980 } })
	assert.equal((await ana.request.post('/api/portal/login', { data: { username, password: username } })).status(), 200)
	assert.equal((await ana.request.post('/api/portal/password', { data: { password: 'qa-shop-password' } })).status(), 200)
	assert.equal((await ana.request.get('/api/portal/shop')).status(), 403, 'the welcome comes first')
	const pass = await (await ana.request.get('/api/portal/pass')).json()
	assert.equal((await ana.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, step: 4, opened: true, signature: { kind: 'drawn', strokes: [[[20, 100], [100, 45], [160, 220]]] } }, revision: pass.revision, completed: true } })).status(), 200)
	assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: [{ kind: 'user', subjectId: id }] } })).status(), 200)

	const shop = async () => (await ana.request.get('/api/portal/shop')).json()
	const points = async () => (await shop()).points
	const spin = (free, spinId = randomUUID()) => ana.request.post('/api/portal/shop/spin', { data: { spinId, free } })
	const buy = (skin) => ana.request.post('/api/portal/shop/buy', { data: { skin } })
	const reveal = (skin, context = ana) => context.request.post('/api/portal/shop/reveal', { data: { skin } })
	let state = await shop()
	assert.equal(state.pool.length, 6)
	assert.equal(new Set(state.pool).size, 6)
	assert(state.rotatesAt > Date.now() && state.rotatesAt <= Date.now() + 24 * 60 * 60 * 1000)
	assert.deepEqual([state.points, state.owned, state.freeSpin, state.review], [0, [], 'locked', { attemptsLeft: 3, active: null }])
	assert.deepEqual([state.revealed, state.gift], [[], { claimed: false, amount: 25, streak: 0 }])
	assert.equal((await spin(false)).status(), 409, 'zero balance cannot spin')
	assert.equal((await spin(true)).status(), 409, 'no free spin before the review')
	assert.equal((await buy(state.pool[0])).status(), 409, 'zero balance cannot buy')
	assert.equal((await ana.request.post('/api/portal/shop/review')).status(), 409, 'no questions yet')
	const outside = (await (await teacher.request.get('/api/portal/shop')).json())
	assert.equal(outside.teacher, true)
	assert.deepEqual(outside.pool, state.pool, 'teacher and student see the same pool')
	assert.equal((await teacher.request.post('/api/portal/shop/spin', { data: { spinId: randomUUID(), free: false } })).status(), 403, 'the teacher cannot spend')
	assert.equal((await buy(REWARD_SKINS.find((skin) => !state.pool.includes(skin)))).status(), 403, 'cards outside today cannot be bought')
	assert.equal((await buy('xp')).status(), 400, 'only reward cards are sold')
	assert.equal((await reveal(REWARD_SKINS.find((skin) => !state.pool.includes(skin)))).status(), 403, 'only today\'s cards can be turned')
	assert.equal((await reveal('xp')).status(), 403)
	assert.deepEqual([outside.revealed, outside.gift.claimed], [outside.pool, true], 'the teacher sees every card face up')
	assert.equal((await reveal(state.pool[0], teacher)).status(), 403, 'the teacher earns nothing')
	assert.equal((await teacher.request.post('/api/portal/shop/gift')).status(), 403)
	assert.equal(await points(), 0, 'rejected reveals pay nothing')

	// Earn 500 points by answering the board questions through the restricted API.
	const page = await teacher.newPage()
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(`/board/${board.id}`)
	await page.waitForFunction(() => !!window.__xpCanvasEditor)
	const shapes = await page.evaluate((questions) => {
		const editor = window.__xpCanvasEditor
		return questions.map(([question, answers, correct], i) => {
			const id = `shape:shop-${crypto.randomUUID()}`
			editor.createShape({ id, type: 'question', x: (i % 3) * 420, y: Math.floor(i / 3) * 320, props: { question, answers, correct, points: 100, revision: 'shop', answered: [] } })
			return id
		})
	}, QUESTIONS)
	// Permission is for a connected student, as in class.
	const student = await ana.newPage()
	student.on('pageerror', (error) => errors.push(error.message))
	await student.goto(`/board/${board.id}`)
	await student.waitForFunction((count) => window.__xpCanvasEditor?.getCurrentPageShapes().filter((shape) => shape.type === 'question').length === count, shapes.length)
	const endpoint = `/api/boards/${board.id}/interactions`
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'permission', userId: id, allowed: true } })).status(), 200)
	for (const [i, shapeId] of shapes.entries()) assert.equal((await ana.request.post(endpoint, { data: { action: 'answer', shapeId, revision: 'shop', answer: QUESTIONS[i][2] } })).status(), 200)
	for (let i = 0; i < 50 && await points() < 500; i++) await new Promise((resolve) => setTimeout(resolve, 200))
	assert.equal(await points(), 500)

	// The dot shows until the student opens today's shop.
	await student.goto('/')
	const dot = student.getByRole('img', { name: 'Hay novedades en la tienda' })
	await dot.waitFor()
	await student.getByRole('button', { name: /^Tienda/ }).click()
	await student.waitForURL('**/tienda')
	await student.getByTestId('portal-shop').waitFor()
	assert.equal(await student.locator('.shop-card').count(), 6)
	assert.equal(await student.locator('.shop-row > li').count(), 7, 'one row: six cards, then the gift')
	assert.equal(await student.locator('.shop-row > li').last().getByTestId('shop-gift').count(), 1)
	assert.equal(await student.getByRole('button', { name: 'Revelar carta' }).count(), 6, 'today\'s cards arrive face down')
	assert.match(await student.getByTestId('shop-countdown').innerText(), /^cambian en (\d+ h|\d+ min|menos de 1 min)$/)
	await student.waitForTimeout(700)
	const desk = await student.locator('.shop-row').evaluate((list) => ({ overflow: getComputedStyle(list).overflowX, overflowY: getComputedStyle(list).overflowY, scrolls: list.scrollWidth > list.clientWidth, width: Math.round(list.children[0].getBoundingClientRect().width) }))
	assert.deepEqual(desk, { overflow: 'auto', overflowY: 'hidden', scrolls: true, width: 196 }, 'the row scrolls sideways on the desktop too, never up or down')
	/** The row never scrolls vertically: nothing reaches past it and it stays at the top. */
	const rowStill = async (moment) => assert.deepEqual(await student.locator('.shop-row').evaluate((list) => ({ top: list.scrollTop, overflow: list.scrollHeight - list.clientHeight })), { top: 0, overflow: 0 }, `the row does not scroll vertically ${moment}`)
	/** "Tirada gratis lista" survives only as screen reader text under the machine. */
	const noFreeLabel = async (moment) => assert.equal(await student.getByText('Tirada gratis lista').and(student.locator(':not(.xp-sr-only)')).count(), 0, `no visible "Tirada gratis lista" ${moment}`)
	await student.locator('.shop-card-slot').first().hover()
	await student.waitForTimeout(300)
	assert.notEqual(await student.locator('.shop-card-stage').first().evaluate((stage) => getComputedStyle(stage).transform), 'none', 'a hovered card lifts')
	await student.mouse.wheel(0, 200)
	await student.waitForTimeout(200)
	await rowStill('after a hover and a vertical wheel')
	// A vertical wheel over the row scrolls the page; the row keeps its place on both axes.
	const scrolls = () => student.locator('.shop-row').evaluate((list) => {
		let page = list.parentElement
		while (page && !(/auto|scroll/.test(getComputedStyle(page).overflowY) && page.scrollHeight > page.clientHeight)) page = page.parentElement
		return { page: (page ?? document.scrollingElement).scrollTop, top: list.scrollTop, left: list.scrollLeft }
	})
	const toTop = () => student.locator('.shop-row').evaluate((list) => { window.scrollTo(0, 0); for (let page = list.parentElement; page; page = page.parentElement) page.scrollTop = 0 })
	await toTop()
	await student.locator('.shop-card-slot').first().hover()
	const before = await scrolls()
	await student.mouse.wheel(0, 300)
	await student.waitForTimeout(400)
	const after = await scrolls()
	assert(after.page > before.page, `the page scrolls under the row (${before.page} → ${after.page})`)
	assert.deepEqual([after.top, after.left], [0, before.left], 'the row does not move while the page scrolls')
	await toTop()
	await student.mouse.move(5, 5)
	assert.equal(await student.locator('.shop-card__price').count(), 0, 'no prices in the row')
	assert.equal(await student.locator('#shop-ticket-title').innerText(), TICKET_LINE)
	assert.equal(await student.locator('.shop-ticket').getAttribute('aria-labelledby'), 'shop-ticket-title')
	// The machine's floor shadow is a pseudo-element under the canvas.
	assert.deepEqual(await student.locator('.shop-machine-frame').evaluate((frame) => { const shadow = getComputedStyle(frame, '::after'); return { content: shadow.content, zIndex: shadow.zIndex, isolation: getComputedStyle(frame).isolation } }),
		{ content: '""', zIndex: '-1', isolation: 'isolate' }, 'the machine casts a floor shadow')
	assert.equal(await student.getByTestId('shop-points').innerText(), '500')
	// The points are just the coin and the number, no pill around them.
	assert.deepEqual(await student.locator('.shop-points').evaluate((pill) => { const style = getComputedStyle(pill); return { border: style.borderStyle, background: style.backgroundColor } }),
		{ border: 'none', background: 'rgba(0, 0, 0, 0)' }, 'no capsule around the points')
	assert.equal(await dot.count(), 0, 'opening the shop clears the dot')
	assert.equal(await student.getByRole('button', { name: /^Tienda/ }).getAttribute('aria-current'), 'page')
	await student.screenshot({ path: '/tmp/shop-desktop.png', fullPage: true })

	// Turning a card pays 5 once; the keyboard works and keeps its place.
	const first = student.locator('.shop-card').first(), firstSkin = await first.getAttribute('data-skin')
	await first.focus()
	await student.keyboard.press('Enter')
	await student.getByTestId('shop-points').filter({ hasText: '505' }).waitFor()
	assert.match(await first.getAttribute('aria-label'), /^Ver /)
	await student.waitForFunction(() => document.activeElement?.classList.contains('shop-card'), null, { timeout: 5000 })
	assert.equal(await student.evaluate(() => document.activeElement.dataset.skin), firstSkin, 'focus returns to the turned card')
	await student.locator('.shop-burst').waitFor({ state: 'detached' })
	await rowStill('after a reveal')
	assert.equal((await reveal(firstSkin)).status(), 200)
	state = await shop()
	assert.deepEqual([state.points, state.revealed], [505, [firstSkin]], 'a second reveal pays nothing')
	for (const skin of state.pool.slice(1)) assert.equal((await reveal(skin)).status(), 200)
	assert.equal(await points(), 530)

	// The daily gift pays once and starts the streak.
	await student.reload()
	await student.getByTestId('portal-shop').waitFor()
	assert.equal(await student.getByRole('button', { name: 'Revelar carta' }).count(), 0)
	// Hovering a face-up card only lifts it; nothing glows under it.
	await student.locator('.shop-card-slot').first().hover()
	await student.waitForTimeout(300)
	assert.equal(await student.locator('.shop-card-stage').first().evaluate((stage) => getComputedStyle(stage, '::before').content), 'none', 'no glow under a face-up card')
	await student.mouse.move(5, 5)
	await student.getByRole('button', { name: 'Reclamar' }).click()
	await student.getByTestId('shop-points').filter({ hasText: '555' }).waitFor()
	assert.match(await student.getByTestId('shop-gift').innerText(), /Mañana/)
	assert.equal(await student.getByTestId('shop-gift').getAttribute('data-claimed'), 'true')
	assert.equal((await ana.request.post('/api/portal/shop/gift')).status(), 409, 'one gift a day')
	state = await shop()
	assert.deepEqual([state.points, state.gift], [555, { claimed: true, amount: 25, streak: 1 }])

	// Each answer is graded at once. A wrong attempt fails, then a fresh attempt earns the free spin.
	const correctFor = (question) => QUESTIONS.find(([text]) => text === question)
	const quiz = student.getByTestId('shop-review')
	const answerAt = (reviewId, index, answer) => ana.request.post(`/api/portal/shop/review/${reviewId}/answer`, { data: { index, answer } })
	/** Answers the question on screen; returns the server's grade once the answer shows its colour. */
	async function answerOne(wrong) {
		const [, answers, correct] = correctFor(await quiz.locator('.shop-review__question').innerText())
		const pick = wrong ? (correct + 1) % 4 : correct
		const graded = student.waitForResponse((response) => response.url().endsWith('/answer'))
		await quiz.getByRole('button', { name: answers[pick], exact: true }).click()
		const result = await (await graded).json()
		await quiz.locator(`.shop-review__answer[data-result="${wrong ? 'wrong' : 'right'}"]`).waitFor()
		assert.equal(await quiz.locator('.shop-review__answer[data-result="right"]').textContent(), `${'ABCD'[correct]}${answers[correct]}`, 'the right answer turns green')
		assert.equal(await quiz.locator('.shop-review__answer:enabled').count(), 0, 'an answered question locks its options')
		return result
	}
	const ticket = student.locator('.shop-ticket'), ticketWidth = (await ticket.boundingBox()).width
	const hero = student.locator('.shop-hero'), heroHeight = (await hero.boundingBox()).height
	// The dev server also shows the QA reset button.
	assert.equal((await student.getByTestId('shop-free-spin').innerText()).replace(/\nDebug: reiniciar preguntas$/, ''), 'Repasar 3 preguntas', 'the review button stands alone')
	await student.getByRole('button', { name: 'Repasar 3 preguntas' }).click()
	await quiz.waitFor()
	assert.equal(await student.locator('[role="dialog"]').count(), 0, 'the review lives in the ticket')
	assert.equal((await ticket.boundingBox()).width, ticketWidth, 'the ticket keeps its width')
	assert.equal((await hero.boundingBox()).height, heroHeight, 'the machine sets the panel height')
	assert.equal(await quiz.getByRole('button', { name: /^(Anterior|Siguiente|Revisar respuestas)$/ }).count(), 0, 'no step buttons')
	// Wrong: red, the right one green, and the options shake.
	const firstQuestion = await quiz.locator('.shop-review__question').innerText()
	const wrong = await answerOne(true)
	assert.deepEqual([wrong.index, wrong.correct, wrong.done, wrong.passed], [0, false, false, null])
	assert.equal(await quiz.locator('.shop-review__answers[data-shake]').count(), 1)
	assert.equal(await student.locator('.question-celebration').count(), 0, 'no rain for a wrong answer')
	await quiz.getByText('Pregunta 2 de 3').waitFor()
	assert.equal(await quiz.locator('.shop-review__progress i[data-state="done"]').count(), 1, 'answered questions count as done')
	const secondQuestion = await quiz.locator('.shop-review__question').innerText()
	assert.notEqual(secondQuestion, firstQuestion)
	// Closing keeps the attempt; it never opens on its own, and it resumes at the next question.
	await quiz.getByRole('button', { name: 'Cerrar' }).click()
	await quiz.waitFor({ state: 'detached' })
	await student.reload()
	await student.getByRole('button', { name: 'Continuar repaso' }).waitFor()
	assert.equal(await quiz.count(), 0, 'an unfinished attempt waits for the button')
	const active = (await shop()).review.active
	assert.deepEqual(active.results.map((result) => result && result.correct), [false, null, null], 'the server keeps each answer')
	// A repeated answer returns the first grade and changes nothing; bad input is rejected.
	const again = await (await answerAt(active.id, 0, wrong.right)).json()
	assert.deepEqual(again, { ...wrong, freeSpin: again.freeSpin, attemptsLeft: again.attemptsLeft }, 'answering twice keeps the first answer')
	assert.equal(again.done, false)
	assert.equal((await answerAt(active.id, 3, 0)).status(), 400)
	assert.equal((await answerAt(active.id, 1, 4)).status(), 400)
	await student.getByRole('button', { name: 'Continuar repaso' }).click()
	await quiz.getByText('Pregunta 2 de 3').waitFor()
	assert.equal(await quiz.locator('.shop-review__question').innerText(), secondQuestion, 'the attempt resumes at the right question')
	assert.equal((await answerOne(false)).done, false)
	await quiz.getByText('Pregunta 3 de 3').waitFor()
	const failed = await answerOne(false)
	assert.deepEqual([failed.done, failed.passed, failed.attemptsLeft], [true, false, 2], 'the third answer finishes the attempt')
	await student.getByRole('heading', { name: 'Casi' }).waitFor()
	assert.equal((await hero.boundingBox()).height, heroHeight, 'the failed step keeps the panel height')
	assert.match(await ticket.innerText(), /Te quedan 2 intentos hoy/)
	assert.equal(await student.locator('.shop-review__marks').count(), 0, 'no marks list')
	assert.equal((await answerAt(active.id, 2, 0)).status(), 409, 'a finished attempt takes no more answers')
	await student.screenshot({ path: '/tmp/shop-review-failed.png' })
	await student.getByRole('button', { name: 'Intentar de nuevo' }).click()
	await quiz.waitFor()
	// Right: green, the class question's rain, then the next question by itself.
	assert.equal((await answerOne(false)).correct, true)
	await student.locator('.question-celebration').waitFor()
	const rainStarted = Date.now()
	// The rain falls inside the gachapon panel, not over the page.
	assert.deepEqual(await student.locator('.question-celebration').evaluate((rain) => {
		const panel = rain.parentElement, box = rain.getBoundingClientRect(), frame = panel.getBoundingClientRect()
		return { panel: panel.className, position: getComputedStyle(rain).position, fits: Math.abs(box.top - frame.top) < 1 && Math.abs(box.bottom - frame.bottom) < 1 }
	}), { panel: 'shop-hero', position: 'absolute', fits: true })
	// The rain fades out from 2.5 s and leaves by 3 s.
	await student.waitForTimeout(2600 - (Date.now() - rainStarted))
	assert.equal(await student.locator('.question-celebration[data-leaving]').count(), 1, 'the rain starts fading at 2.5 s')
	await student.waitForTimeout(200)
	const fading = Number(await student.locator('.question-celebration').evaluate((rain) => getComputedStyle(rain).opacity))
	assert(fading > 0 && fading < 1, `the rain is mid-fade at 2.8 s (opacity ${fading})`)
	await student.waitForTimeout(3200 - (Date.now() - rainStarted))
	assert.equal(await student.locator('.question-celebration').count(), 0, 'the rain is gone after its fade')
	await quiz.getByText('Pregunta 2 de 3').waitFor()
	await answerOne(false)
	await quiz.getByText('Pregunta 3 de 3').waitFor()
	const passed = await answerOne(false)
	assert.deepEqual([passed.done, passed.passed, passed.freeSpin], [true, true, 'available'])
	// Straight to the title alone, which takes focus from the quiz.
	await student.locator('#shop-ticket-title').filter({ hasText: FREE_LINE }).waitFor()
	assert.equal(await student.locator('#shop-ticket-title').innerText(), FREE_LINE)
	assert.equal(await quiz.count(), 0)
	assert.equal(await student.locator('.shop-ticket__free').count(), 0, 'nothing below the title once the spin is earned')
	assert.equal(await student.evaluate(() => document.activeElement?.id), 'shop-ticket-title')
	await noFreeLabel('after passing')
	await student.screenshot({ path: '/tmp/shop-review-passed.png' })
	state = await shop()
	assert.deepEqual([state.freeSpin, state.review.attemptsLeft], ['available', 1])
	assert.equal((await ana.request.post('/api/portal/shop/review')).status(), 409, 'no review after earning the spin')

	// Free spin from the machine, then a paid one with the coin.
	const machineReady = () => student.waitForFunction(() => document.querySelector('.shop-machine')?.getAttribute('data-three') !== 'loading')
	await machineReady()
	assert.match(await student.locator('.shop-machine [role="status"]').innerText(), /Tirada gratis/)
	assert.equal(await student.getByTestId('shop-machine-status').getAttribute('class'), 'xp-sr-only', 'the ticket says the spin is free; the machine stays quiet')
	await noFreeLabel('with the machine ready')
	await student.getByRole('button', { name: /^Girar gachapon/ }).click()
	await student.locator('.gachapon-reveal').waitFor()
	// No words under the machine while the prize is on its way.
	assert.equal(await student.getByTestId('shop-machine-status').getAttribute('class'), 'xp-sr-only', 'the machine status is hidden during a reveal')
	assert.match(await student.locator('.gachapon-reveal__prize').innerText(), new RegExp(`${name} ganó`))
	await student.screenshot({ path: '/tmp/shop-reveal.png' })
	await student.locator('.gachapon-reveal').waitFor({ state: 'detached', timeout: 15_000 })
	await student.locator('#shop-ticket-title').filter({ hasText: LATER_LINE }).waitFor()
	assert.equal(await student.locator('.shop-ticket__free').count(), 0, 'a used free spin leaves the title alone')
	assert.equal(await student.getByRole('button', { name: /Vuelve mañana/ }).count(), 0, 'no button for tomorrow')
	assert.equal(await student.getByTestId('shop-points').innerText(), '555', 'the free spin costs nothing')
	assert.equal(await student.locator('.shop-card[data-owned="true"]').count(), 1)
	assert.equal((await spin(true)).status(), 409, 'one free spin per day')
	await machineReady()
	// The glowing coin is the hint; the words stay for screen readers only.
	assert.equal(await student.getByTestId('shop-machine-status').getAttribute('class'), 'xp-sr-only')
	const coin = student.getByRole('button', { name: 'Insertar moneda de 150 puntos' })
	if (await coin.count()) await coin.click()
	await student.getByRole('button', { name: 'Girar gachapon', exact: true }).click()
	await student.locator('.gachapon-reveal').waitFor()
	await student.getByTestId('shop-points').filter({ hasText: '405' }).waitFor()
	await student.locator('.gachapon-reveal').waitFor({ state: 'detached', timeout: 15_000 })
	await student.locator('.shop-card[data-owned="true"]').nth(1).waitFor()
	state = await shop()
	assert.equal(state.owned.length, 2, 'a spin never repeats an owned card')

	// Buying happens in the card's detail: a second tap confirms and charges exactly the price.
	const skin = await student.locator('.shop-card[data-owned="false"]').first().getAttribute('data-skin')
	const card = student.locator(`.shop-card[data-skin="${skin}"]`)
	assert.match(await card.getAttribute('aria-label'), /^Ver /)
	await card.click()
	// A closing detail stays in the page while its card flies home; the open one is the other.
	const detail = student.locator('.shop-detail:not([data-leaving="true"])').getByTestId('shop-card-detail')
	await detail.waitFor()
	await rowStill('with a detail open')
	assert.equal(await card.count(), 0, 'the card leaves its slot for the detail')
	assert.equal(await student.locator('.shop-row > li').first().evaluate((item) => Math.round(item.getBoundingClientRect().width)), 196, 'the slot keeps its size')
	await detail.getByRole('button', { name: 'Comprar · 300' }).click()
	await detail.getByRole('button', { name: 'Confirmar · 300' }).click()
	assert.equal(await detail.getByRole('button', { name: 'Ya la tienes' }).isDisabled(), true)
	assert.equal(await student.locator('.shop-card__badge').count(), 0, 'no owned badge')
	assert.equal(await student.getByTestId('shop-points').innerText(), '105')
	// Closing never blocks the row: another card opens at once while this one flies home.
	const next = student.locator('.shop-card[data-owned="false"]').first(), nextName = (await next.getAttribute('aria-label')).replace(/^Ver /, '')
	const box = await next.boundingBox()
	assert(box.x >= 0 && box.x + box.width <= 1360, 'the next card is on screen')
	await student.keyboard.press('Escape')
	await student.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
	assert.equal(await detail.locator('.shop-detail__name').innerText(), nextName, 'the second card opens')
	// Short of points: the detail's button says how many are missing; a click outside closes it.
	assert.equal(await detail.getByRole('button', { name: 'Te faltan 195 puntos' }).isDisabled(), true)
	await student.mouse.click(10, 400)
	await student.locator('.shop-detail').first().waitFor({ state: 'detached' })
	await card.waitFor()
	await rowStill('after a detail closes')
	assert.equal(await card.getAttribute('data-owned'), 'true')
	assert.equal(await student.locator('.shop-card__badge').count(), 0, 'owned cards look like the others')
	assert.equal(await student.getByTestId('shop-machine-status').innerText(), 'Te faltan 45 puntos')
	assert.equal(await points(), 105)
	// A card closed while the row scrolls still lands in its slot.
	const third = student.locator('.shop-row > li').nth(2)
	await student.locator('.shop-row').evaluate((list) => { list.scrollLeft = 0 })
	await third.scrollIntoViewIfNeeded()
	await third.locator('.shop-card').click()
	await detail.waitFor()
	await student.waitForTimeout(700)
	const rowBox = await student.locator('.shop-row').boundingBox()
	await student.mouse.move(rowBox.x + 400, rowBox.y + 150)
	await student.keyboard.press('Escape')
	await student.waitForTimeout(60)
	await student.mouse.wheel(300, 0)
	await student.mouse.move(5, 5)
	await student.waitForTimeout(600)
	const landing = await third.evaluate((slot) => {
		const card = slot.querySelector('.shop-card-stage > div')?.getBoundingClientRect(), home = slot.getBoundingClientRect()
		return card && Math.max(...['left', 'top', 'width', 'height'].map((side) => Math.abs(card[side] - home[side])))
	})
	assert(landing !== undefined && landing <= 1, `the card lands in its slot after the row scrolls (off by ${landing} px)`)
	await rowStill('after a card lands from a scrolled row')
	assert.equal((await buy(skin)).status(), 409, 'a card is bought once')
	assert.equal((await spin(false)).status(), 409, 'a spin needs 150 points')
	assert.equal(await points(), 105, 'rejected requests never charge')
	const unlocked = (await (await ana.request.get('/api/portal/pass')).json()).unlockedSkins
	assert.equal(unlocked.length, 3)
	assert(unlocked.includes(skin), 'shop cards unlock in the pass')
	assert.equal((await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.id === id).points, 105, 'teacher sees the net balance')
	await student.screenshot({ path: '/tmp/shop-after.png', fullPage: true })

	// The teacher previews the shop without buying.
	await page.goto('/tienda')
	await page.getByTestId('portal-shop').waitFor()
	await page.getByText(TICKET_LINE).waitFor()
	await page.locator('.shop-card').first().click()
	assert.equal(await page.getByTestId('shop-card-detail').getByRole('button', { name: '300 puntos' }).isDisabled(), true, 'the teacher cannot buy')
	await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
	await page.getByTestId('shop-card-detail').waitFor({ state: 'detached' })
	assert.equal(await page.getByTestId('shop-machine-status').innerText(), 'Vista previa')
	assert.equal(await page.getByTestId('shop-points').count(), 0)
	assert.equal(await page.getByRole('button', { name: 'Revelar carta' }).count(), 0)
	assert.match(await page.getByTestId('shop-gift').innerText(), /Vista previa/)
	assert.equal(await page.getByRole('button', { name: 'Reclamar' }).count(), 0)

	// Phone layout: the same single row scrolls sideways, and the dot sits on the drawer button for a new day.
	const phone = await browser.newContext({ baseURL, ...devices['iPhone 13'] })
	await phone.addCookies(await ana.cookies())
	const mobile = await phone.newPage()
	mobile.on('pageerror', (error) => errors.push(error.message))
	await mobile.goto('/')
	const drawer = mobile.getByRole('button', { name: 'Mostrar carpetas', exact: true })
	await drawer.getByRole('img', { name: 'Hay novedades en la tienda' }).waitFor()
	assert.equal(await drawer.getAttribute('aria-describedby'), await drawer.locator('.board-nav-dot').getAttribute('id'), 'the dot describes the drawer button')
	await mobile.goto('/tienda')
	await mobile.locator('.shop-card').first().waitFor()
	assert.equal(await drawer.getAttribute('aria-describedby'), null, 'the dot clears on the phone too')
	const row = await mobile.locator('.shop-row').evaluate((list) => ({ overflow: getComputedStyle(list).overflowX, scrolls: list.scrollWidth > list.clientWidth, rows: new Set([...list.children].map((item) => item.offsetTop)).size }))
	assert.deepEqual(row, { overflow: 'auto', scrolls: true, rows: 1 }, 'the row never wraps on the phone')
	assert.equal(await mobile.locator('.shop-row > li').first().evaluate((item) => Math.round(item.getBoundingClientRect().width)), 196)
	await mobile.locator('.shop-card[data-owned="false"]').first().click()
	await mobile.getByTestId('shop-card-detail').waitFor()
	await mobile.waitForTimeout(800)
	const fits = await mobile.getByTestId('shop-card-detail').evaluate((content) => { const box = content.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth })
	assert.equal(fits, true, 'the detail fits the phone')
	await mobile.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
	await mobile.getByTestId('shop-card-detail').waitFor({ state: 'detached' })
	await mobile.emulateMedia({ reducedMotion: 'reduce' })
	assert.equal(await mobile.locator('.shop-row > li').first().evaluate((item) => getComputedStyle(item).animationName), 'none', 'reduced motion keeps the cards still')
	await mobile.screenshot({ path: '/tmp/shop-phone.png', fullPage: true })
	assert.deepEqual(errors, [])
	console.log('Shop smoke passed: daily pool, dot, card reveals, daily gift, per-question review in the ticket with resume, retry, a rain inside the panel and free spin, paid spin, purchase in the detail, instant reopen, a row that never scrolls vertically, exact balances, pass unlocks, teacher preview, phone layout and reduced motion.')
} finally { await browser.close() }
