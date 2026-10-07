import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Creates synthetic accounts and documents. Use an isolated portal QA server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Shop smoke requires localhost and isolated QA state.')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
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
	// Two pools: the machine's six prizes for the day and six cards for sale every six hours, never the same card.
	assert.equal(state.pool.length, 6)
	assert.equal(new Set(state.pool).size, 6)
	assert.equal(state.shop.length, 6)
	assert.equal(new Set(state.shop).size, 6)
	assert(state.shop.every((skin) => REWARD_SKINS.includes(skin) && !state.pool.includes(skin)), 'the cards for sale come from the catalog minus the machine\'s')
	assert.match(state.slot, /^\d{4}-\d{2}-\d{2}\/[0-3]$/)
	assert(state.rotatesAt > Date.now() && state.rotatesAt - Date.now() <= 6 * 60 * 60 * 1000, 'the cards for sale change within six hours')
	assert.deepEqual([state.points, state.owned, state.freeSpin, state.review], [0, [], 'locked', { attemptsLeft: 3, active: null }])
	assert.deepEqual([state.revealed, state.gift], [[], { claimed: false, amount: 25, streak: 0 }])
	assert.equal((await spin(false)).status(), 409, 'zero balance cannot spin')
	assert.equal((await spin(true)).status(), 409, 'no free spin before the review')
	assert.equal((await buy(state.shop[0])).status(), 409, 'zero balance cannot buy')
	assert.equal((await buy(state.pool[0])).status(), 403, 'the machine\'s cards are not for sale')
	assert.equal((await reveal(state.pool[0])).status(), 403, 'the machine\'s cards are not turned for points')
	assert.equal((await ana.request.post('/api/portal/shop/review')).status(), 409, 'no questions yet')
	const outside = (await (await teacher.request.get('/api/portal/shop')).json())
	assert.equal(outside.teacher, true)
	assert.deepEqual([outside.pool, outside.shop], [state.pool, state.shop], 'teacher and student see the same pools')
	assert.equal((await teacher.request.post('/api/portal/shop/spin', { data: { spinId: randomUUID(), free: false } })).status(), 403, 'the teacher cannot spend')
	const elsewhere = REWARD_SKINS.find((skin) => !state.shop.includes(skin) && !state.pool.includes(skin))
	assert.equal((await buy(elsewhere)).status(), 403, 'cards outside the shop cannot be bought')
	assert.equal((await buy('xp')).status(), 400, 'only reward cards are sold')
	assert.equal((await reveal(elsewhere)).status(), 403, 'only the cards for sale can be turned')
	assert.equal((await reveal('xp')).status(), 403)
	assert.deepEqual([outside.revealed, outside.gift.claimed], [outside.shop, true], 'the teacher sees every card face up')
	assert.equal((await reveal(state.shop[0], teacher)).status(), 403, 'the teacher earns nothing')
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
	const strip = student.locator('.shop-strip'), row = student.locator('.shop-row')
	// The shell shows before the shop loads; count once the cards are there.
	await row.locator('.shop-card').first().waitFor()
	assert.equal(await student.locator('.shop-ticket').count(), 0, 'no ticket around the review')
	assert.equal(await strip.locator('.shop-card').count(), 6)
	assert.equal(await strip.locator(':scope > li').count(), 6, 'the strip holds only the machine\'s six cards')
	assert.deepEqual(await strip.locator('.shop-card').evaluateAll((cards) => cards.map((card) => card.dataset.skin)), state.pool, 'the strip shows the machine\'s cards')
	assert.equal(await strip.getByRole('button', { name: 'Revelar carta' }).count(), 0, 'the machine\'s cards arrive face up')
	assert.equal(await row.locator(':scope > li').count(), 7, 'one row: the six cards for sale, then the gift')
	assert.equal(await row.locator(':scope > li').last().getByTestId('shop-gift').count(), 1)
	assert.equal(await row.getByRole('button', { name: 'Revelar carta' }).count(), 6, 'the cards for sale arrive face down')
	assert.equal(await student.locator('#shop-cards-title').innerText(), 'Cartas en venta')
	assert.match(await student.locator('.shop-cards').getByTestId('shop-countdown').innerText(), /^\d{2}:\d{2}$/)
	assert.equal(await student.locator('.shop-hero').getByTestId('shop-countdown').count(), 0, 'no clock in the hero')
	await student.waitForTimeout(700)
	const desk = await row.evaluate((list) => ({ overflow: getComputedStyle(list).overflowX, overflowY: getComputedStyle(list).overflowY, scrolls: list.scrollWidth > list.clientWidth, width: Math.round(list.children[0].getBoundingClientRect().width) }))
	assert.deepEqual(desk, { overflow: 'auto', overflowY: 'hidden', scrolls: true, width: 196 }, 'the row scrolls sideways on the desktop too, never up or down')
	const stripWidth = () => strip.evaluate((list) => Math.round(list.children[0].getBoundingClientRect().width))
	assert.equal(await stripWidth(), 120, 'the strip\'s cards are 120 px wide')
	/** Both rows fade and blur an edge exactly where more cards wait past it. The blur's overlays fade in over 200 ms. */
	for (const list of [strip, row]) {
		const edges = await list.evaluate(async (element) => {
			const settle = () => new Promise((resolve) => setTimeout(resolve, 300))
			const fades = () => Object.fromEntries([...element.parentElement.querySelectorAll(':scope > .shop-scroller__fade')]
				.map((fade) => [fade.dataset.side, `${getComputedStyle(fade).opacity}${getComputedStyle(fade).backdropFilter.includes('blur') ? ' blur' : ''}`]))
			element.scrollLeft = 0; await settle()
			const start = element.dataset.more ?? null, overflows = element.scrollWidth > element.clientWidth, startFades = fades(), mask = getComputedStyle(element).maskImage
			element.scrollLeft = element.scrollWidth; await settle()
			const end = element.dataset.more ?? null, endFades = fades()
			element.scrollLeft = 0; await settle()
			return { overflows, start, end, startFades, endFades, mask: overflows ? null : mask }
		})
		assert.deepEqual(edges, edges.overflows
			? { overflows: true, start: 'right', end: 'left', startFades: { left: '0 blur', right: '1 blur' }, endFades: { left: '1 blur', right: '0 blur' }, mask: null }
			: { overflows: false, start: null, end: null, startFades: { left: '0 blur', right: '0 blur' }, endFades: { left: '0 blur', right: '0 blur' }, mask: 'none' }, 'the edges fade and blur only where cards continue')
	}
	/** The rows never scroll vertically: nothing reaches past them and they stay at the top. */
	const rowStill = async (moment) => {
		for (const list of [strip, row]) assert.deepEqual(await list.evaluate((element) => ({ top: element.scrollTop, overflow: element.scrollHeight - element.clientHeight })), { top: 0, overflow: 0 }, `the rows do not scroll vertically ${moment}`)
	}
	/** "Tirada gratis lista" survives only as screen reader text under the machine. */
	const noFreeLabel = async (moment) => assert.equal(await student.getByText('Tirada gratis lista').and(student.locator(':not(.xp-sr-only)')).count(), 0, `no visible "Tirada gratis lista" ${moment}`)
	await row.locator('.shop-card-slot').first().hover()
	await student.waitForTimeout(300)
	assert.notEqual(await row.locator('.shop-card-stage').first().evaluate((stage) => getComputedStyle(stage).transform), 'none', 'a hovered card lifts')
	await student.mouse.wheel(0, 200)
	await student.waitForTimeout(200)
	await rowStill('after a hover and a vertical wheel')
	// A vertical wheel over either row scrolls the page; the row keeps its place on both axes.
	const toTop = () => row.evaluate((list) => { window.scrollTo(0, 0); for (let page = list.parentElement; page; page = page.parentElement) page.scrollTop = 0 })
	for (const list of [strip, row]) {
		const scrolls = () => list.evaluate((element) => {
			let page = element.parentElement
			while (page && !(/auto|scroll/.test(getComputedStyle(page).overflowY) && page.scrollHeight > page.clientHeight)) page = page.parentElement
			return { page: (page ?? document.scrollingElement).scrollTop, top: element.scrollTop, left: element.scrollLeft }
		})
		await toTop()
		await list.locator('.shop-card-slot').first().hover()
		const before = await scrolls()
		await student.mouse.wheel(0, 300)
		await student.waitForTimeout(400)
		const after = await scrolls()
		assert(after.page > before.page, `the page scrolls under the row (${before.page} → ${after.page})`)
		assert.deepEqual([after.top, after.left], [0, before.left], 'the row does not move while the page scrolls')
	}
	await toTop()
	await student.mouse.move(5, 5)
	assert.equal(await student.locator('.shop-card__price').count(), 0, 'no prices in the row')
	assert.equal(await student.locator('#shop-panel-title').innerText(), TICKET_LINE)
	assert.equal(await student.locator('.shop-panel').getAttribute('aria-labelledby'), 'shop-panel-title')
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
	const first = row.locator('.shop-card').first(), firstSkin = await first.getAttribute('data-skin')
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
	for (const skin of state.shop.slice(1)) assert.equal((await reveal(skin)).status(), 200)
	assert.equal(await points(), 530)

	// The daily gift pays once and starts the streak.
	await student.reload()
	await row.locator('.shop-card').first().waitFor()
	assert.equal(await student.getByRole('button', { name: 'Revelar carta' }).count(), 0)
	// Hovering a face-up card only lifts it; nothing glows under it.
	await row.locator('.shop-card-slot').first().hover()
	await student.waitForTimeout(300)
	assert.equal(await row.locator('.shop-card-stage').first().evaluate((stage) => getComputedStyle(stage, '::before').content), 'none', 'no glow under a face-up card')
	assert.equal(await strip.locator('.shop-card-stage').first().evaluate((stage) => getComputedStyle(stage, '::before').content), 'none', 'no glow under the machine\'s cards')
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
	/** Waits for question `n` (1-based) to be the current one; the progress segments are the only count. */
	const onQuestion = (n) => quiz.locator(`.shop-review__progress i:nth-child(${n})[data-state="current"]`).waitFor()
	/** Measures how far a strip or row card sits from its place once it is home: its stage, which only differs from the slot under a lift. */
	const offHome = (slot) => slot.evaluate((item) => {
		const card = item.querySelector('.shop-card-stage > div')?.getBoundingClientRect(), home = item.querySelector('.shop-card-stage')?.getBoundingClientRect()
		return card && Math.max(...['left', 'top', 'width', 'height'].map((side) => Math.abs(card[side] - home[side])))
	})
	/** A landed card's corners: its own and its morph wrapper's, which Motion keeps in step. */
	const corners = (slot) => slot.evaluate((item) => { const card = item.querySelector('.pass-card'); return [getComputedStyle(card).borderTopLeftRadius, getComputedStyle(card.parentElement).borderTopLeftRadius] })
	const back = student.getByRole('button', { name: 'Cerrar el repaso' })
	const panel = student.locator('.shop-panel'), panelWidth = (await panel.boundingBox()).width
	const hero = student.locator('.shop-hero'), heroHeight = (await hero.boundingBox()).height
	// The dev server also shows the QA reset button.
	assert.equal((await student.getByTestId('shop-free-spin').innerText()).replace(/\nDebug: reiniciar preguntas$/, ''), 'Repasar 3 preguntas', 'the review button stands alone')
	assert.equal(await back.count(), 0, 'no back arrow outside the quiz')
	await student.getByRole('button', { name: 'Repasar 3 preguntas' }).click()
	await quiz.waitFor()
	// While the cards gather, neither the strip nor the panel clips them; only the hero's rounded edge does.
	const gatherStarted = Date.now()
	const clips = () => student.evaluate(() => ({ strip: getComputedStyle(document.querySelector('.shop-strip')).overflowX, panel: getComputedStyle(document.querySelector('.shop-panel')).overflowX }))
	await student.waitForTimeout(Math.max(0, 120 - (Date.now() - gatherStarted)))
	assert.deepEqual(await clips(), { strip: 'visible', panel: 'visible' }, 'nothing clips the cards while they gather')
	// The corners ease with the gather: mid-way they sit between the spread card's 10 px and the thumbnail's 3 px. Mid-animation Motion writes them as a share of the box.
	const midCorner = await strip.evaluate((list) => {
		const card = list.querySelector('.pass-card'), value = getComputedStyle(card).borderTopLeftRadius
		return value.endsWith('%') ? parseFloat(value) / 100 * card.getBoundingClientRect().width : parseFloat(value)
	})
	assert(midCorner > 3 && midCorner < 10, `the corners ease with the gather (${midCorner} px at 120 ms)`)
	assert.equal(await student.locator('[role="dialog"]').count(), 0, 'the review lives in the panel')
	assert.equal((await panel.boundingBox()).width, panelWidth, 'the panel keeps its width')
	assert.equal((await hero.boundingBox()).height, heroHeight, 'the machine sets the panel height')
	assert.equal(await quiz.getByRole('button', { name: /^(Anterior|Siguiente|Revisar respuestas)$/ }).count(), 0, 'no step buttons')
	assert.equal(await student.locator('.shop-panel__head > button.xp-icon-button.shop-panel__back + #shop-panel-title').count(), 1, 'a back arrow sits left of the title')
	assert.equal(await back.isEnabled(), true)
	assert.equal(await quiz.getByText(/^Pregunta \d de 3$/).count(), 0, 'the progress segments are the only count')
	// The machine's cards gather into a tray above the quiz.
	await student.locator('.shop-strip[data-tray]').waitFor()
	await student.waitForTimeout(700)
	assert.deepEqual(await strip.evaluate((list) => ({ tray: list.hasAttribute('data-tray'), slots: list.children.length, cardWidth: getComputedStyle(list).getPropertyValue('--card-w').trim(), width: Math.round(list.children[0].getBoundingClientRect().width) })),
		{ tray: true, slots: 6, cardWidth: '34px', width: 34 }, 'six 34 px thumbnails in the deck during the quiz')
	assert.deepEqual(await clips(), { strip: 'visible', panel: 'auto' }, 'the deck stays unclipped once it settles; the panel scrolls again')
	await rowStill('with the tray')
	// The deck: centred over the questions, never scrolling, nothing focused and nothing floating at rest.
	const preview = student.locator('.shop-tray__preview')
	const focused = () => strip.evaluate((list) => [...list.children].filter((slot) => slot.hasAttribute('data-focus')).map((slot) => slot.dataset.slot))
	assert.equal(await student.locator('.shop-tray').count(), 0, 'no capsule around the deck')
	assert.deepEqual(await strip.evaluate((list) => {
		const first = list.children[0].getBoundingClientRect(), last = list.lastElementChild.getBoundingClientRect(), box = list.getBoundingClientRect()
		return { overflow: getComputedStyle(list).overflowX, scrolls: list.scrollWidth > list.clientWidth, more: list.dataset.more ?? null, mask: getComputedStyle(list).maskImage, centred: Math.abs((first.left + last.right) / 2 - (box.left + box.right) / 2) <= 1 }
	}), { overflow: 'visible', scrolls: false, more: null, mask: 'none', centred: true }, 'the deck is centred, never scrolls and fades nothing')
	assert.deepEqual(await focused(), [], 'nothing is focused at rest')
	assert.equal(await preview.count(), 0, 'no preview at rest')
	// Hovering a thumbnail focuses it and raises its preview; leaving the deck clears both.
	await strip.locator(':scope > li').nth(1).hover()
	await preview.waitFor()
	assert.deepEqual(await focused(), [state.pool[1]], 'the hovered thumbnail is focused')
	await student.waitForTimeout(300)
	assert.equal(await preview.getAttribute('data-skin'), state.pool[1], 'the preview shows the focused card')
	const left = Date.now()
	await student.mouse.move(5, 5)
	await preview.waitFor({ state: 'detached' })
	assert(Date.now() - left <= 500, `the preview sinks within 500 ms of leaving (${Date.now() - left} ms)`)
	assert.deepEqual(await focused(), [], 'leaving the deck clears the focus')
	// Reduced motion: the thumbnail still focuses, but nothing rises.
	await student.emulateMedia({ reducedMotion: 'reduce' })
	await strip.locator(':scope > li').nth(2).hover()
	await student.waitForTimeout(400)
	assert.deepEqual(await focused(), [state.pool[2]])
	assert.equal(await preview.count(), 0, 'no preview under reduced motion')
	await student.mouse.move(5, 5)
	await student.emulateMedia({ reducedMotion: 'no-preference' })
	await student.waitForTimeout(300)
	// A card opens from the tray too: the machine's cards show no price, and the card lands back in its tray slot.
	await strip.locator('.shop-card').first().click()
	const shown = student.locator('.shop-detail:not([data-leaving="true"])').getByTestId('shop-card-detail')
	await shown.waitFor()
	assert.equal(await shown.locator('.shop-detail__buy').count(), 0, 'the machine\'s cards are not for sale')
	assert.equal(await student.locator('.shop-detail .shop-float').count(), 1, 'the detail card floats')
	assert.equal(await student.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Cerrar', 'focus goes to the close button')
	await student.waitForTimeout(700)
	await student.mouse.move(5, 5)
	await student.keyboard.press('Escape')
	await student.locator('.shop-detail').waitFor({ state: 'detached' })
	await student.waitForTimeout(300)
	const fromTray = await offHome(strip.locator(':scope > li').first())
	assert(fromTray !== undefined && fromTray <= 1, `the card lands in its tray slot (off by ${fromTray} px)`)
	assert.deepEqual(await corners(strip.locator(':scope > li').first()), ['3px', '3px'], 'the landed thumbnail keeps its wrapper\'s corners')
	// Wrong: red, the right one green, and the options shake.
	const firstQuestion = await quiz.locator('.shop-review__question').innerText()
	const wrong = await answerOne(true)
	assert.deepEqual([wrong.index, wrong.correct, wrong.done, wrong.passed], [0, false, false, null])
	assert.equal(await quiz.locator('.shop-review__answers[data-shake]').count(), 1)
	assert.equal(await back.isDisabled(), true, 'the back arrow waits while an answer is graded')
	assert.equal(await student.locator('.question-celebration').count(), 0, 'no rain for a wrong answer')
	await onQuestion(2)
	assert.equal(await quiz.locator('.shop-review__progress i[data-state="done"]').count(), 1, 'answered questions count as done')
	const secondQuestion = await quiz.locator('.shop-review__question').innerText()
	assert.notEqual(secondQuestion, firstQuestion)
	// The back arrow closes the quiz and keeps the attempt; the cards spread back.
	await back.click()
	await student.getByRole('button', { name: 'Continuar repaso' }).waitFor()
	assert.equal(await student.locator('#shop-panel-title').innerText(), TICKET_LINE)
	assert.equal(await back.count(), 0)
	await student.waitForTimeout(700)
	assert.equal(await strip.evaluate((list) => getComputedStyle(list).getPropertyValue('--card-w').trim()), '120px', 'the cards spread back once the quiz closes')
	// A spread card lands with the corners it left with.
	await strip.locator('.shop-card').first().click()
	await shown.waitFor()
	await student.waitForTimeout(700)
	await student.keyboard.press('Escape')
	await student.locator('.shop-detail').waitFor({ state: 'detached' })
	await student.waitForTimeout(300)
	assert.deepEqual(await corners(strip.locator(':scope > li').first()), ['10px', '10px'], 'the landed strip card keeps its wrapper\'s corners')
	// Leaving the page keeps the attempt; it never opens on its own, and it resumes at the next question.
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
	// Touch: a tap on a thumbnail opens its detail at once; nothing focuses or floats.
	const tablet = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true })
	await tablet.addCookies(await ana.cookies())
	const touch = await tablet.newPage()
	touch.on('pageerror', (error) => errors.push(error.message))
	await touch.goto('/tienda')
	await touch.getByRole('button', { name: 'Continuar repaso' }).tap()
	await touch.locator('.shop-strip[data-tray]').waitFor()
	await touch.waitForTimeout(700)
	await touch.locator('.shop-strip > li').nth(1).locator('.shop-card').tap()
	await touch.getByTestId('shop-card-detail').waitFor()
	assert.deepEqual([await touch.locator('.shop-strip > li[data-focus]').count(), await touch.locator('.shop-tray__preview').count(), await touch.locator('.shop-detail__buy').count()], [0, 0, 0], 'a tap opens the detail without focus or preview')
	await tablet.close()
	await student.getByRole('button', { name: 'Continuar repaso' }).click()
	await onQuestion(2)
	assert.equal(await quiz.locator('.shop-review__question').innerText(), secondQuestion, 'the attempt resumes at the right question')
	assert.equal((await answerOne(false)).done, false)
	await onQuestion(3)
	const failed = await answerOne(false)
	assert.deepEqual([failed.done, failed.passed, failed.attemptsLeft], [true, false, 2], 'the third answer finishes the attempt')
	await student.getByRole('heading', { name: 'Casi' }).waitFor()
	assert.equal((await hero.boundingBox()).height, heroHeight, 'the failed step keeps the panel height')
	assert.match(await panel.innerText(), /Te quedan 2 intentos hoy/)
	// The cards spread back once the quiz ends.
	await student.locator('.shop-strip:not([data-tray])').waitFor()
	await student.waitForTimeout(700)
	assert.deepEqual(await strip.evaluate((list) => ({ tray: list.hasAttribute('data-tray'), slots: list.children.length, width: Math.round(list.children[0].getBoundingClientRect().width) })),
		{ tray: false, slots: 6, width: 120 }, 'the cards spread back after the quiz')
	assert.deepEqual(await clips(), { strip: 'auto', panel: 'auto' }, 'the spread strip scrolls sideways again once the cards settle')
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
	await onQuestion(2)
	await answerOne(false)
	await onQuestion(3)
	const passed = await answerOne(false)
	assert.deepEqual([passed.done, passed.passed, passed.freeSpin], [true, true, 'available'])
	// Straight to the title alone, which takes focus from the quiz.
	await student.locator('#shop-panel-title').filter({ hasText: FREE_LINE }).waitFor()
	assert.equal(await student.locator('#shop-panel-title').innerText(), FREE_LINE)
	assert.equal(await quiz.count(), 0)
	assert.equal(await student.locator('.shop-panel__step').count(), 0, 'nothing below the title once the spin is earned')
	assert.equal(await student.evaluate(() => document.activeElement?.id), 'shop-panel-title')
	await noFreeLabel('after passing')
	await student.screenshot({ path: '/tmp/shop-review-passed.png' })
	state = await shop()
	assert.deepEqual([state.freeSpin, state.review.attemptsLeft], ['available', 1])
	assert.equal((await ana.request.post('/api/portal/shop/review')).status(), 409, 'no review after earning the spin')

	// Free spin from the machine, then a paid one with the coin.
	const machineReady = () => student.waitForFunction(() => document.querySelector('.shop-machine')?.getAttribute('data-three') !== 'loading')
	await machineReady()
	assert.match(await student.locator('.shop-machine [role="status"]').innerText(), /Tirada gratis/)
	assert.equal(await student.getByTestId('shop-machine-status').getAttribute('class'), 'xp-sr-only', 'the panel says the spin is free; the machine stays quiet')
	await noFreeLabel('with the machine ready')
	await student.getByRole('button', { name: /^Girar gachapon/ }).click()
	await student.locator('.gachapon-reveal').waitFor()
	// No words under the machine while the prize is on its way.
	assert.equal(await student.getByTestId('shop-machine-status').getAttribute('class'), 'xp-sr-only', 'the machine status is hidden during a reveal')
	assert.match(await student.locator('.gachapon-reveal__prize').innerText(), new RegExp(`${name} ganó`))
	await student.screenshot({ path: '/tmp/shop-reveal.png' })
	await student.locator('.gachapon-reveal').waitFor({ state: 'detached', timeout: 15_000 })
	await student.locator('#shop-panel-title').filter({ hasText: LATER_LINE }).waitFor()
	assert.equal(await student.locator('.shop-panel__step').count(), 0, 'a used free spin leaves the title alone')
	assert.equal(await student.getByRole('button', { name: /Vuelve mañana/ }).count(), 0, 'no button for tomorrow')
	assert.equal(await student.getByTestId('shop-points').innerText(), '555', 'the free spin costs nothing')
	assert.equal(await strip.locator('.shop-card[data-owned="true"]').count(), 1, 'the prize is one of the machine\'s cards')
	// An owned machine card fades to grey; no badge.
	await student.waitForTimeout(500)
	assert.notEqual(await strip.locator('.shop-card-slot[data-owned="true"] .shop-card-stage').evaluate((stage) => getComputedStyle(stage).filter), 'none', 'owned machine cards are dimmed')
	assert.equal(await strip.locator('.shop-card-slot[data-owned="false"] .shop-card-stage').first().evaluate((stage) => getComputedStyle(stage).filter), 'none')
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
	await strip.locator('.shop-card[data-owned="true"]').nth(1).waitFor()
	state = await shop()
	assert.equal(state.owned.length, 2, 'a spin never repeats an owned card')
	assert(state.owned.every((skin) => state.pool.includes(skin)), 'spins draw from the machine\'s cards')

	// Buying happens in the card's detail: a second tap confirms and charges exactly the price.
	const skin = await row.locator('.shop-card[data-owned="false"]').first().getAttribute('data-skin')
	const card = row.locator(`.shop-card[data-skin="${skin}"]`)
	assert.match(await card.getAttribute('aria-label'), /^Ver /)
	await card.click()
	// A closing detail stays in the page while its card flies home; the open one is the other.
	const detail = student.locator('.shop-detail:not([data-leaving="true"])').getByTestId('shop-card-detail')
	await detail.waitFor()
	await rowStill('with a detail open')
	assert.equal(await card.count(), 0, 'the card leaves its slot for the detail')
	assert.equal(await row.locator(':scope > li').first().evaluate((item) => Math.round(item.getBoundingClientRect().width)), 196, 'the slot keeps its size')
	assert.equal(await student.locator('.shop-detail .shop-float').count(), 1, 'the detail card floats')
	await detail.getByRole('button', { name: 'Comprar · 300' }).click()
	await detail.getByRole('button', { name: 'Confirmar · 300' }).click()
	assert.equal(await detail.getByRole('button', { name: 'Ya la tienes' }).isDisabled(), true)
	assert.equal(await student.locator('.shop-card__badge').count(), 0, 'no owned badge')
	assert.equal(await student.getByTestId('shop-points').innerText(), '105')
	// Closing never blocks the row: another card opens at once while this one flies home.
	const next = row.locator('.shop-card[data-owned="false"]').first(), nextName = (await next.getAttribute('aria-label')).replace(/^Ver /, '')
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
	const third = row.locator(':scope > li').nth(2)
	await row.evaluate((list) => { list.scrollLeft = 0 })
	await third.scrollIntoViewIfNeeded()
	await third.locator('.shop-card').click()
	await detail.waitFor()
	await student.waitForTimeout(700)
	const rowBox = await row.boundingBox()
	await student.mouse.move(rowBox.x + 400, rowBox.y + 150)
	await student.keyboard.press('Escape')
	await student.waitForTimeout(60)
	await student.mouse.wheel(300, 0)
	await student.mouse.move(5, 5)
	await student.waitForTimeout(600)
	const landing = await offHome(third)
	assert(landing !== undefined && landing <= 1, `the card lands in its slot after the row scrolls (off by ${landing} px)`)
	assert.deepEqual(await corners(third), ['17px', '17px'], 'the landed row card keeps its wrapper\'s corners')
	await rowStill('after a card lands from a scrolled row')
	assert.equal((await buy(skin)).status(), 409, 'a card is bought once')
	assert.equal((await spin(false)).status(), 409, 'a spin needs 150 points')
	assert.equal(await points(), 105, 'rejected requests never charge')
	const unlocked = (await (await ana.request.get('/api/portal/pass')).json()).unlockedSkins
	assert.equal(unlocked.length, 3)
	assert(unlocked.includes(skin), 'shop cards unlock in the pass')
	assert.equal((await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.id === id).points, 105, 'teacher sees the net balance')
	await student.screenshot({ path: '/tmp/shop-after.png', fullPage: true })

	// The page never scrolls sideways, at rest, as the cards gather, in the quiz or on the failed step. A second student keeps the first one's review attempts.
	{
		const other = `Q${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
		assert.equal((await teacher.request.post('/api/portal/students', { data: { students: [{ username: other, name: 'Bea Tienda' }] } })).status(), 201)
		const otherId = (await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.username === other).id
		const bea = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } })
		assert.equal((await bea.request.post('/api/portal/login', { data: { username: other, password: other } })).status(), 200)
		assert.equal((await bea.request.post('/api/portal/password', { data: { password: 'qa-shop-password' } })).status(), 200)
		const draft = await (await bea.request.get('/api/portal/pass')).json()
		assert.equal((await bea.request.put('/api/portal/pass', { data: { draft: { ...draft.draft, step: 4, opened: true, signature: { kind: 'drawn', strokes: [[[20, 100], [100, 45], [160, 220]]] } }, revision: draft.revision, completed: true } })).status(), 200)
		const { grants } = await (await teacher.request.get(`/api/portal/boards/${board.id}/access`)).json()
		assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: [...grants, { kind: 'user', subjectId: otherId }] } })).status(), 200)
		// The review draws on the boards the student can open, so access is enough.
		const wide = await bea.newPage()
		wide.on('pageerror', (error) => errors.push(error.message))
		const flat = async (moment) => assert.deepEqual(await wide.evaluate(() => [document.scrollingElement, document.querySelector('.board-main')].map((box) => [box.scrollWidth - box.clientWidth, box.scrollLeft])),
			[[0, 0], [0, 0]], `the page never scrolls sideways ${moment}`)
		const otherQuiz = wide.getByTestId('shop-review')
		for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
			const at = `at ${viewport.width} × ${viewport.height}`
			await wide.setViewportSize(viewport)
			await wide.goto('/tienda')
			await wide.locator('.shop-row .shop-card').first().waitFor()
			await wide.waitForTimeout(700)
			await flat(`at rest ${at}`)
			await wide.getByRole('button', { name: 'Repasar 3 preguntas' }).click()
			await otherQuiz.waitFor()
			const opened = Date.now()
			await wide.waitForTimeout(Math.max(0, 120 - (Date.now() - opened)))
			await flat(`as the cards gather ${at}`)
			await wide.waitForTimeout(700)
			await flat(`in the quiz ${at}`)
			const box = await otherQuiz.boundingBox()
			await wide.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
			await wide.mouse.wheel(300, 0)
			await wide.waitForTimeout(400)
			await flat(`after a sideways wheel over the quiz ${at}`)
			for (let n = 1; n <= 3; n++) {
				await otherQuiz.locator(`.shop-review__progress i:nth-child(${n})[data-state="current"]`).waitFor()
				const [, answers, correct] = correctFor(await otherQuiz.locator('.shop-review__question').innerText())
				await otherQuiz.getByRole('button', { name: answers[(correct + 1) % 4], exact: true }).click()
				await otherQuiz.locator('.shop-review__answer[data-result]').first().waitFor()
			}
			await wide.getByRole('heading', { name: 'Casi' }).waitFor()
			await wide.waitForTimeout(700)
			await flat(`on the failed step ${at}`)
		}
		await bea.close()
	}

	// The teacher previews the shop without buying.
	await page.goto('/tienda')
	await page.getByTestId('portal-shop').waitFor()
	await page.getByText(TICKET_LINE).waitFor()
	await page.locator('.shop-row .shop-card').first().click()
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
	for (const list of ['.shop-strip', '.shop-row']) {
		const phoneRow = await mobile.locator(list).evaluate((element) => ({ overflow: getComputedStyle(element).overflowX, scrolls: element.scrollWidth > element.clientWidth, rows: new Set([...element.children].map((item) => item.offsetTop)).size }))
		assert.deepEqual(phoneRow, { overflow: 'auto', scrolls: true, rows: 1 }, `${list} never wraps on the phone`)
	}
	assert.equal(await mobile.locator('.shop-row > li').first().evaluate((item) => Math.round(item.getBoundingClientRect().width)), 196)
	assert.equal(await mobile.locator('.shop-strip > li').first().evaluate((item) => Math.round(item.getBoundingClientRect().width)), 120)
	await mobile.locator('.shop-row .shop-card[data-owned="false"]').first().click()
	await mobile.getByTestId('shop-card-detail').waitFor()
	await mobile.waitForTimeout(800)
	const fits = await mobile.getByTestId('shop-card-detail').evaluate((content) => { const box = content.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth })
	assert.equal(fits, true, 'the detail fits the phone')
	await mobile.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
	await mobile.getByTestId('shop-card-detail').waitFor({ state: 'detached' })
	await mobile.emulateMedia({ reducedMotion: 'reduce' })
	assert.equal(await mobile.locator('.shop-row > li').first().evaluate((item) => getComputedStyle(item).animationName), 'none', 'reduced motion keeps the cards still')
	await mobile.locator('.shop-row .shop-card').first().click()
	await mobile.getByTestId('shop-card-detail').waitFor()
	assert.equal(await mobile.locator('.shop-detail .shop-float').evaluate((float) => getComputedStyle(float).animationName), 'none', 'reduced motion keeps the detail card still')
	await mobile.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
	await mobile.getByTestId('shop-card-detail').waitFor({ state: 'detached' })
	await mobile.screenshot({ path: '/tmp/shop-phone.png', fullPage: true })
	assert.deepEqual(errors, [])
	console.log('Shop smoke passed: the machine\'s daily cards in the hero strip with a tray during the quiz, six-hour cards for sale, dot, card reveals, daily gift, per-question review in the panel with a centred deck, hover focus and floating preview, resume, retry, a rain inside the panel and free spin, paid spin, purchase in the detail, instant reopen, a row that never scrolls vertically, blurred edges, corners that ease with the gather, a page that never scrolls sideways, exact balances, pass unlocks, teacher preview, phone layout and reduced motion.')
} finally { await browser.close() }
