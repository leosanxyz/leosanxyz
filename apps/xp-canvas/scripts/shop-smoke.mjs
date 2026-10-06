import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, devices } from 'playwright-core'

// Creates synthetic accounts and documents. Use an isolated portal QA server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Shop smoke requires localhost and isolated QA state.')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
const errors = []
const REWARD_SKINS = ['arcane-knight', 'moon-magic', 'sunset-riders', 'lunar-witch', 'golden-warrior', 'starlight-duo', 'zelda-campfire', 'tracer', 'soraka', 'shadow-warrior', 'luke', 'attack-titan', 'rengoku', 'gyro', 'emilia']
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
	assert.match(await student.getByTestId('shop-countdown').innerText(), /^cambian en \d+ (h|min)$/)
	assert.equal(await student.getByTestId('shop-points').innerText(), '500')
	assert.equal(await dot.count(), 0, 'opening the shop clears the dot')
	assert.equal(await student.getByRole('button', { name: /^Tienda/ }).getAttribute('aria-current'), 'page')
	await student.screenshot({ path: '/tmp/shop-desktop.png', fullPage: true })

	// Turning a card pays 5 once; the keyboard works and keeps its place.
	const first = student.locator('.shop-card').first(), firstSkin = await first.getAttribute('data-skin')
	await first.focus()
	await student.keyboard.press('Enter')
	await student.getByTestId('shop-points').filter({ hasText: '505' }).waitFor()
	assert.match(await first.getAttribute('aria-label'), /^Comprar /)
	await student.waitForFunction(() => document.activeElement?.classList.contains('shop-card'), null, { timeout: 5000 })
	assert.equal(await student.evaluate(() => document.activeElement.dataset.skin), firstSkin, 'focus returns to the turned card')
	assert.equal((await reveal(firstSkin)).status(), 200)
	state = await shop()
	assert.deepEqual([state.points, state.revealed], [505, [firstSkin]], 'a second reveal pays nothing')
	for (const skin of state.pool.slice(1)) assert.equal((await reveal(skin)).status(), 200)
	assert.equal(await points(), 530)

	// The daily gift pays once and starts the streak.
	await student.reload()
	await student.getByTestId('portal-shop').waitFor()
	assert.equal(await student.getByRole('button', { name: 'Revelar carta' }).count(), 0)
	await student.getByRole('button', { name: 'Reclamar' }).click()
	await student.getByTestId('shop-points').filter({ hasText: '555' }).waitFor()
	assert.match(await student.getByTestId('shop-gift').innerText(), /Mañana/)
	assert.equal(await student.getByTestId('shop-gift').getAttribute('data-claimed'), 'true')
	assert.equal((await ana.request.post('/api/portal/shop/gift')).status(), 409, 'one gift a day')
	state = await shop()
	assert.deepEqual([state.points, state.gift], [555, { claimed: true, amount: 25, streak: 1 }])

	// A wrong attempt reveals the right answers, then a fresh attempt earns the free spin.
	const correctFor = (question) => QUESTIONS.find(([text]) => text === question)
	async function answerReview(wrongFirst) {
		const dialog = student.getByTestId('shop-review')
		for (let i = 0; i < 3; i++) {
			const [, answers, correct] = correctFor(await dialog.locator('.shop-review__question').innerText())
			const pick = wrongFirst && i === 0 ? (correct + 1) % 4 : correct
			await dialog.getByRole('button', { name: answers[pick], exact: true }).click()
			await dialog.getByRole('button', { name: i === 2 ? 'Revisar respuestas' : 'Siguiente' }).click()
		}
	}
	await student.getByRole('button', { name: 'Repasar 3 preguntas' }).click()
	await answerReview(true)
	await student.getByRole('heading', { name: 'Casi' }).waitFor()
	assert.match(await student.getByTestId('shop-review').innerText(), /Te quedan 2 intentos hoy/)
	assert.equal(await student.locator('.shop-review__marks li[data-correct="false"]').count(), 1)
	await student.screenshot({ path: '/tmp/shop-review-failed.png' })
	await student.getByRole('button', { name: 'Intentar de nuevo' }).click()
	await answerReview(false)
	await student.getByRole('heading', { name: 'Tirada gratis desbloqueada' }).waitFor()
	await student.screenshot({ path: '/tmp/shop-review-passed.png' })
	await student.getByRole('button', { name: 'Ir a la máquina' }).click()
	await student.getByTestId('shop-review').waitFor({ state: 'detached' })
	assert.match(await student.getByTestId('shop-free-spin').innerText(), /Tirada gratis lista/)
	state = await shop()
	assert.deepEqual([state.freeSpin, state.review.attemptsLeft], ['available', 1])
	assert.equal((await ana.request.post('/api/portal/shop/review')).status(), 409, 'no review after earning the spin')

	// Free spin from the machine, then a paid one with the coin.
	const machineReady = () => student.waitForFunction(() => document.querySelector('.shop-machine')?.getAttribute('data-three') !== 'loading')
	await machineReady()
	assert.match(await student.locator('.shop-machine [role="status"]').innerText(), /Tirada gratis/)
	await student.getByRole('button', { name: /^Girar gachapon/ }).click()
	await student.locator('.gachapon-reveal').waitFor()
	assert.match(await student.locator('.gachapon-reveal__prize').innerText(), new RegExp(`${name} ganó`))
	await student.screenshot({ path: '/tmp/shop-reveal.png' })
	await student.locator('.gachapon-reveal').waitFor({ state: 'detached', timeout: 15_000 })
	await student.getByText('Tirada gratis usada').waitFor()
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

	// Buying asks for a second tap and charges exactly the price.
	const skin = await student.locator('.shop-card[data-owned="false"]').first().getAttribute('data-skin')
	const card = student.locator(`.shop-card[data-skin="${skin}"]`)
	await card.click()
	assert.equal(await card.locator('.shop-card__price').innerText(), 'Confirmar · 300')
	await card.click()
	await card.locator('.shop-card__badge').waitFor()
	assert.match(await card.getAttribute('aria-label'), /: ya la tienes$/)
	assert.equal(await card.getAttribute('aria-disabled'), 'true')
	assert.equal(await student.getByTestId('shop-points').innerText(), '105')
	// Short of points: the card explains with a notice that leaves on its own.
	await student.locator('.shop-card[data-owned="false"]').first().click()
	const short = student.getByRole('alert').filter({ hasText: 'Te faltan 195 puntos' })
	await short.waitFor()
	await short.waitFor({ state: 'detached', timeout: 6000 })
	assert.equal(await student.getByTestId('shop-machine-status').innerText(), 'Te faltan 45 puntos')
	assert.equal(await points(), 105)
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
	await page.getByText('Los alumnos compran aquí con sus puntos.').waitFor()
	assert.equal(await page.locator('.shop-card:not([aria-disabled="true"])').count(), 0)
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
	assert.equal(await mobile.locator('.shop-card[data-owned="false"] .shop-card__price').first().evaluate((pill) => getComputedStyle(pill).opacity), '1', 'touch shows the price without hover')
	await mobile.emulateMedia({ reducedMotion: 'reduce' })
	assert.equal(await mobile.locator('.shop-row > li').first().evaluate((item) => getComputedStyle(item).animationName), 'none', 'reduced motion keeps the cards still')
	await mobile.screenshot({ path: '/tmp/shop-phone.png', fullPage: true })
	assert.deepEqual(errors, [])
	console.log('Shop smoke passed: daily pool, dot, card reveals, daily gift, review retry and free spin, paid spin, purchase, exact balances, pass unlocks, teacher preview, phone layout and reduced motion.')
} finally { await browser.close() }
