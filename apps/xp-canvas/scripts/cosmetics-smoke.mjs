import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Creates synthetic accounts and documents. Use an isolated portal QA server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Cosmetics smoke requires localhost and isolated QA state.')
const OUT = process.env.QA_OUT ?? '/tmp/cosmeticos-qa'
await mkdir(OUT, { recursive: true })
// The real GPU draws the shaders as Leo will see them; set XP_SWIFTSHADER=1 on a machine without one.
const gpu = process.env.XP_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist']
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', ...gpu] })
const errors = []
const watch = (page) => { page.on('pageerror', (error) => errors.push(error.message)); return page }
const isCard = (prize) => !prize.includes(':')

/** Records the page while `act` runs and writes a GIF of `clip`, from Chromium's own frames. */
async function gif(page, clip, file, act) {
	const dir = `${OUT}/frames`, frames = []
	await rm(dir, { recursive: true, force: true }); await mkdir(dir)
	const cdp = await page.context().newCDPSession(page)
	cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, at: metadata.timestamp }); void cdp.send('Page.screencastFrameAck', { sessionId }) })
	const { width, height } = page.viewportSize()
	await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: width * 2, maxHeight: height * 2 })
	await act()
	await cdp.send('Page.stopScreencast')
	const list = []
	for (const [i, frame] of frames.entries()) {
		await writeFile(`${dir}/${i}.png`, Buffer.from(frame.data, 'base64'))
		list.push(`file '${dir}/${i}.png'`, `duration ${Math.max(0.016, ((frames[i + 1]?.at ?? frame.at + 0.6) - frame.at)).toFixed(3)}`)
	}
	await writeFile(`${dir}/list.txt`, list.join('\n') + `\nfile '${dir}/${frames.length - 1}.png'\n`)
	// Frames come in device pixels: the PNG's width over the page's.
	const scale = Buffer.from(frames[0].data, 'base64').readUInt32BE(16) / page.viewportSize().width, crop = `crop=${clip.width * scale}:${clip.height * scale}:${clip.x * scale}:${clip.y * scale}`
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', `${crop},fps=30,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse`, file])
	return frames.length
}

try {
	const teacher = await browser.newContext({ baseURL, viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 2 })
	assert.equal((await teacher.request.post('/api/portal/login', { data: { username: 'leo', password: process.env.PORTAL_QA_PASSWORD ?? 'qa-teacher-password-only-local' } })).status(), 200)
	const board = await (await teacher.request.post('/api/boards', { data: { name: 'Cosméticos QA' } })).json()

	/** A student with a finished pass, logged in its own context. */
	async function student(name, skin) {
		const username = `C${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`
		assert.equal((await teacher.request.post('/api/portal/students', { data: { students: [{ username, name }] } })).status(), 201)
		const id = (await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.username === username).id
		const context = await browser.newContext({ baseURL, viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 2 })
		assert.equal((await context.request.post('/api/portal/login', { data: { username, password: username } })).status(), 200)
		assert.equal((await context.request.post('/api/portal/password', { data: { password: 'qa-cosmetics-password' } })).status(), 200)
		const pass = await (await context.request.get('/api/portal/pass')).json()
		assert.equal((await context.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, skin, step: 4, opened: true, signature: { kind: 'typed', name } }, revision: pass.revision, completed: true } })).status(), 200)
		assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: [...grants, { kind: 'user', subjectId: id }] } })).status(), 200)
		grants.push({ kind: 'user', subjectId: id })
		return { id, context, name, username }
	}
	const grants = []
	const shop = async (who) => (await who.context.request.get('/api/portal/shop')).json()
	const buy = (who, item) => who.context.request.post('/api/portal/shop/cosmetic/buy', { data: { item } })
	const reveal = (who, item) => who.context.request.post('/api/portal/shop/reveal', { data: { item } })
	const spin = (who) => who.context.request.post('/api/portal/shop/spin', { data: { spinId: randomUUID(), free: false } })
	const savePass = async (who, change) => {
		const pass = await (await who.context.request.get('/api/portal/pass')).json()
		return who.context.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, ...change }, revision: pass.revision, completed: true } })
	}

	// Points come the class way: a question worth the amount, answered on the canvas.
	const teacherPage = watch(await teacher.newPage())
	await teacherPage.goto(`/board/${board.id}`)
	await teacherPage.waitForFunction(() => !!window.__xpCanvasEditor)
	async function earn(who, amount) {
		const before = (await shop(who)).points
		const shapeId = await teacherPage.evaluate((amount) => {
			const id = `shape:cosmetics-${crypto.randomUUID()}`
			window.__xpCanvasEditor.createShape({ id, type: 'question', x: Math.random() * 2000, y: Math.random() * 2000, props: { question: '¿Cuánto es 2 + 2?', answers: ['3', '4', '5', '6'], correct: 1, points: amount, revision: 'cosmetics', answered: [] } })
			return id
		}, amount)
		const view = await who.context.newPage()
		await view.goto(`/board/${board.id}`)
		await view.waitForFunction((shapeId) => !!window.__xpCanvasEditor?.getShape(shapeId), shapeId)
		const endpoint = `/api/boards/${board.id}/interactions`
		assert.equal((await teacher.request.post(endpoint, { data: { action: 'permission', userId: who.id, allowed: true } })).status(), 200)
		assert.equal((await who.context.request.post(endpoint, { data: { action: 'answer', shapeId, revision: 'cosmetics', answer: 1 } })).status(), 200)
		for (let i = 0; i < 50 && (await shop(who)).points < before + amount; i++) await new Promise((resolve) => setTimeout(resolve, 200))
		assert.equal((await shop(who)).points, before + amount)
		await view.close()
	}

	// Luis has nothing: the rows rotate by rarity, nothing outside them is sold, and nothing he does not own can be worn.
	const luis = await student('Luis Prueba', 'doom')
	let state = await shop(luis)
	assert.deepEqual([state.cosmetics, state.cover], [[], 'doom'])
	assert.equal(state.effects.length, 6)
	assert.equal(state.plates.length, 6)
	assert(state.effects.every((id) => /^(material|frame):/.test(id)) && state.plates.every((id) => id.startsWith('plate:')), 'each row from its own part of the catalog')
	assert(![...state.effects, ...state.plates].some((id) => id.startsWith('effect:') || id === 'plate:grafito' || id === 'frame:fino-gris'), 'no profile effects nor free basics')
	assert.equal(state.pool.filter(isCard).length, 2, 'two cards in the machine, the rest cosmetics')
	assert.equal((await buy(luis, state.plates[0])).status(), 409, 'zero balance cannot buy')
	const away = ['plate:aurora', 'plate:neon', 'plate:pixel', 'plate:tinta', 'plate:crema'].find((id) => !state.plates.includes(id))
	assert.equal((await buy(luis, away)).status(), 403, 'only the rotation\'s items are sold')
	assert.equal((await buy(luis, 'effect:eclipse')).status(), 403, 'profile effects are not for sale yet')
	assert.equal((await savePass(luis, { frame: 'frame:oro-vivo' })).status(), 403, 'the pass save checks ownership')
	assert.equal((await savePass(luis, { finish: 'matte', hologram: { pattern: 'grid', intensity: 65, phase: 0.18, area: 'all', hue: 195, material: 'fuego' } })).status(), 403, 'materials are no longer free')
	assert.equal((await savePass(luis, { plate: 'plate:grafito', frame: 'frame:fino-gris' })).status(), 200, 'the free basics are everyone\'s')
	// Turning every item pays 5 each and shows its rarity; each row keeps to the deal.
	for (const item of [...state.effects, ...state.plates]) assert.equal((await reveal(luis, item)).status(), 200)
	assert.equal((await shop(luis)).points, 60)
	assert.equal((await reveal(luis, away)).status(), 403, 'only the rotation\'s items are turned')
	const luisPage = watch(await luis.context.newPage())
	await luisPage.goto('/tienda')
	const rarities = async (place) => luisPage.locator(`.shop-row[data-place="${place}"] .prize-cover`).evaluateAll((faces) => faces.map((face) => face.dataset.rarity))
	await luisPage.locator('.shop-row[data-place="plates"] .prize-cover').first().waitFor()
	for (const place of ['effects', 'plates']) {
		const row = await rarities(place), count = (rarity) => row.filter((item) => item === rarity).length
		assert.equal(row.length, 6, `${place}: six turned`)
		assert(count('legendaria') <= 1, `${place}: at most one legendary`)
		assert([1, 2].includes(count('epica')), `${place}: one or two epics`)
	}
	const strip = await luisPage.locator('.shop-strip .shop-card-slot').evaluateAll((slots) => slots.map((slot) => slot.querySelector('.prize-face')?.dataset.rarity ?? 'card'))
	assert.equal(strip[0], 'legendaria', 'the machine opens on its legendary')
	assert.equal(strip.filter((rarity) => rarity === 'legendaria').length, 1)
	assert(strip.filter((rarity) => rarity === 'epica').length >= 1, 'at least one epic in the machine')
	assert.equal(strip.filter((rarity) => rarity === 'card').length, 2)
	assert.equal(await luisPage.locator('.shop-wear, .shop-tier, .shop-slots').count(), 0, 'no pass section and no tier list in the shop')
	assert.equal(await luisPage.getByText('Tu pase', { exact: true }).count(), 0)
	assert.deepEqual(await luisPage.getByTestId('portal-shop').locator('.shop-cards h2').allInnerTexts(), ['Cartas en venta', 'Efectos de carta', 'Placas'])
	// Without materials, the pass editor offers no Especial finish; Marco and Placa hold only the free basics.
	const luisProfile = watch(await luis.context.newPage())
	await luisProfile.goto('/perfil')
	await luisProfile.getByRole('button', { name: 'Personalizar mi pase' }).click()
	const finishes = luisProfile.getByRole('group', { name: 'Acabado de la carta' })
	await finishes.waitFor()
	assert.deepEqual(await finishes.getByRole('button').allInnerTexts(), ['Normal', 'Holograma'])
	assert.deepEqual(await luisProfile.locator('[data-wear="frame"] button').evaluateAll((buttons) => buttons.map((button) => button.ariaLabel)), ['Ninguno', 'Fino gris'])
	assert.deepEqual(await luisProfile.locator('[data-wear="plate"] button').evaluateAll((buttons) => buttons.map((button) => button.ariaLabel)), ['Ninguno', 'Grafito'])

	// Dana turns an effect in the row, buys it in its detail, then a plate, all from the rows.
	const dana = await student('Dana Ríos', 'hades')
	await earn(dana, 4000)
	state = await shop(dana)
	const page = watch(await dana.context.newPage())
	await page.goto('/tienda')
	const effects = page.locator('.shop-row[data-place="effects"]'), plates = page.locator('.shop-row[data-place="plates"]')
	await page.locator('.shop[aria-busy="false"]:not([data-entrance])').waitFor()
	await effects.scrollIntoViewIfNeeded()
	await page.evaluate(() => window.scrollBy(0, -80))
	await page.waitForTimeout(600)
	const firstEffect = effects.locator('.shop-card').first(), effectId = await firstEffect.getAttribute('data-skin')
	assert.equal(await firstEffect.getAttribute('aria-label'), 'Revelar carta')
	const box = await effects.locator(':scope > li').first().boundingBox()
	const clip = { x: Math.max(0, Math.round(box.x - 40)), y: Math.max(0, Math.round(box.y - 40)), width: Math.round(box.width + 80), height: Math.round(box.height + 80) }
	const frames = await gif(page, clip, `${OUT}/revelar-efecto.gif`, async () => {
		await page.waitForTimeout(300)
		await firstEffect.click()
		await page.getByTestId('shop-points').filter({ hasText: /^4,005$/ }).waitFor()
		await page.waitForTimeout(1500)
	})
	assert(frames > 10, `the reveal was recorded (${frames} frames)`)
	// Turned, a row's cosmetic shows its preview and its name only; its rarity and price wait in the detail.
	const face = effects.locator(`.shop-card-slot:has(.shop-card[data-skin="${effectId}"]) .prize-cover`)
	await face.waitFor()
	assert.match(await face.locator('.prize-caption').innerText(), /\S/)
	assert.equal(await effects.locator('.prize-rarity, .shop-coin').count(), 0, 'no rarity nor price in the rows')
	assert.equal(await plates.locator('.prize-rarity, .shop-coin').count(), 0, 'no rarity nor price in the rows')
	let price
	async function purchase(row, id) {
		const card = row.locator(`.shop-card[data-skin="${id}"]`)
		if (await card.getAttribute('aria-label') === 'Revelar carta') { await card.click(); await page.waitForTimeout(700) }
		await card.click()
		const detail = page.locator('.shop-detail:not([data-leaving="true"])').getByTestId('shop-card-detail')
		await detail.waitFor()
		assert.match(await detail.locator('.prize-rarity').innerText(), /^(Común|Rara|Épica|Legendaria)$/)
		price = (await detail.locator('.shop-detail__buy[data-mode="buy"]').innerText()).replace(/\D/g, '')
		await detail.locator('.shop-detail__buy[data-mode="buy"]').click()
		const bought = page.waitForResponse((response) => response.url().endsWith('/cosmetic/buy'))
		await detail.locator('.shop-detail__buy[data-mode="confirm"]').click()
		assert.equal((await bought).status(), 200)
		await detail.locator('.shop-detail__buy[data-mode="owned"]').waitFor()
		await page.keyboard.press('Escape')
		await page.locator('.shop-detail').waitFor({ state: 'detached' })
		await row.locator(`.shop-card[data-skin="${id}"][data-owned="true"]`).waitFor()
	}
	await purchase(effects, effectId)
	assert.equal((await shop(dana)).points, 4005 - Number(price), 'exactly the price shown in the detail')
	await purchase(plates, state.plates[0])
	// The rest of the effects row: a frame and a material, so the editor has something of each.
	state = await shop(dana)
	for (const kind of ['frame', 'material']) {
		const id = state.effects.find((item) => item.startsWith(`${kind}:`) && !state.cosmetics.includes(item))
		if (id && !state.cosmetics.some((item) => item.startsWith(`${kind}:`))) assert.equal((await buy(dana, id)).status(), 200)
	}
	state = await shop(dana)
	assert.equal((await buy(dana, effectId)).status(), 409, 'one purchase per item')
	// A few turned in each row for the capture.
	for (const item of [...state.shop.slice(0, 2), ...state.effects.slice(1, 3), ...state.plates.slice(0, 3)]) await reveal(dana, item)
	await page.reload()
	await page.locator('.shop[aria-busy="false"]:not([data-entrance])').waitFor()
	await page.waitForTimeout(2500)
	await page.setViewportSize({ width: 1360, height: 2300 })
	await page.waitForTimeout(1500)
	await page.screenshot({ path: `${OUT}/tienda-completa.png` })
	await page.setViewportSize({ width: 1360, height: 1000 })
	await page.locator('.shop-hero').screenshot({ path: `${OUT}/maquina.png` })

	// The machine: spins draw from what she does not have, weighted by rarity; a cosmetic won is hers at no cost and cannot be bought after.
	state = await shop(dana)
	const before = state.cosmetics.length
	let won = null, spins = 0
	while (!won && spins < 6) {
		const result = await spin(dana)
		assert.equal(result.status(), 200)
		const prize = (await result.json()).skin
		spins++
		assert(state.pool.includes(prize), 'the prize comes from the machine')
		if (!isCard(prize)) won = prize
	}
	assert(won, 'a cosmetic came out within the pool')
	state = await shop(dana)
	assert(state.cosmetics.includes(won), 'the won cosmetic is hers')
	assert.equal(state.cosmetics.length, before + 1)
	const pass = await (await dana.context.request.get('/api/portal/pass')).json()
	assert(pass.cosmetics.includes(won), 'the pass sees it too')
	assert(!pass.unlockedSkins.includes(won), 'a cosmetic is not a cover')
	const balance = state.points
	assert.equal((await buy(dana, won)).status(), [...state.effects, ...state.plates].includes(won) ? 409 : 403, 'what was won is not sold again')
	assert.equal((await shop(dana)).points, balance, 'and nothing is charged for trying')
	// The reveal shows a cosmetic as its preview with its rarity: one more UI spin until one comes out, if any is left.
	await page.reload()
	await page.locator('.shop[aria-busy="false"]:not([data-entrance])').waitFor()
	for (let i = 0; i < 6; i++) {
		state = await shop(dana)
		if (!state.pool.some((prize) => !isCard(prize) && !state.cosmetics.includes(prize))) break
		await page.waitForFunction(() => !!document.querySelector('[data-testid="portal-shop"] .shop-machine[data-three]:not([data-three="loading"])'))
		const coin = page.getByRole('button', { name: 'Insertar moneda de 150 puntos' })
		if (await coin.count()) await coin.click()
		const spun = page.waitForResponse((response) => response.url().endsWith('/shop/spin'))
		await page.getByRole('button', { name: 'Girar gachapon', exact: true }).click()
		const prize = (await (await spun).json()).skin
		await page.locator('.gachapon-reveal').waitFor()
		if (!isCard(prize)) {
			await page.waitForTimeout(5200)
			await page.screenshot({ path: `${OUT}/maquina-premio.png` })
			assert.equal(await page.locator('.gachapon-reveal__face[data-cosmetic] .prize-face').count(), 1)
			await page.locator('.gachapon-reveal').waitFor({ state: 'detached', timeout: 15_000 })
			break
		}
		await page.locator('.gachapon-reveal').waitFor({ state: 'detached', timeout: 15_000 })
	}

	// She wears them from the profile: Marco and Placa list only what she has, plus the free basics.
	state = await shop(dana)
	const profile = watch(await dana.context.newPage())
	await profile.goto('/perfil')
	await profile.getByRole('button', { name: 'Personalizar mi pase' }).click()
	const frameRow = profile.locator('[data-wear="frame"]'), plateRow = profile.locator('[data-wear="plate"]')
	await frameRow.waitFor()
	const frameIds = ['frame:fino-gris', ...state.cosmetics.filter((id) => id.startsWith('frame:'))], plateIds = ['plate:grafito', ...state.cosmetics.filter((id) => id.startsWith('plate:'))]
	assert.equal(await frameRow.locator('button').count(), 1 + frameIds.length)
	assert.equal(await plateRow.locator('button').count(), 1 + plateIds.length)
	const myFrame = frameIds.at(-1), myPlate = plateIds.at(-1), myMaterial = state.cosmetics.find((id) => id.startsWith('material:'))
	await frameRow.locator(`button[data-item="${myFrame}"]`).click()
	await plateRow.locator(`button[data-item="${myPlate}"]`).click()
	if (myMaterial) {
		await profile.getByRole('group', { name: 'Acabado de la carta' }).getByRole('button', { name: 'Especial' }).click()
		const specials = profile.getByRole('group', { name: 'Material especial' }).getByRole('button')
		assert.equal(await specials.count(), state.cosmetics.filter((id) => id.startsWith('material:')).length, 'Especial offers only her materials')
		await specials.first().click()
	}
	await profile.waitForTimeout(1800)
	await profile.screenshot({ path: `${OUT}/editor-pase.png` })
	await profile.locator('.profile-edit-controls').screenshot({ path: `${OUT}/editor-filas.png` })
	const saved = profile.waitForResponse((response) => response.url().endsWith('/api/portal/pass') && response.request().method() === 'PUT')
	await profile.getByRole('button', { name: 'Guardar cambios' }).click()
	assert.equal((await saved).status(), 200)
	const worn = (await (await dana.context.request.get('/api/portal/pass')).json()).draft
	assert.deepEqual([worn.frame, worn.plate], [myFrame, myPlate], 'the editor saved the frame and the plate')
	if (myMaterial) assert.equal(`material:${worn.hologram.material}`, myMaterial)

	// Leo sees them in Alumnos: the plate behind her name and the frame on her mini.
	const list = watch(await teacher.newPage())
	await list.goto('/alumnos')
	const row = list.locator('.portal-student').filter({ hasText: dana.username })
	await row.locator(`.plate[data-plate]`).first().waitFor()
	await row.locator('.card-frame').first().waitFor()
	assert.equal(await list.evaluate(() => document.querySelectorAll('canvas').length), 0, 'no live WebGL in the list')
	const roster = await (await teacher.request.get('/api/portal/roster')).json()
	assert.deepEqual((({ plate, frame }) => ({ plate, frame }))(roster.students.find((s) => s.id === dana.id)), { plate: myPlate, frame: myFrame })

	assert.deepEqual(errors, [])
	console.log(`Cosmetics smoke passed. Captures in ${OUT}`)
} finally {
	await browser.close()
}
