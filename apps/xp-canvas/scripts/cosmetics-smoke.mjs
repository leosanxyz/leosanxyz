import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
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
	const equip = (who, slot, item) => who.context.request.post('/api/portal/shop/cosmetic/equip', { data: { slot, item } })

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

	// Without points nothing is bought, and nothing not bought can be worn, from the shop or by saving the pass.
	const luis = await student('Luis Prueba', 'doom')
	let state = await shop(luis)
	assert.deepEqual(state.cosmetics, { owned: [], equipped: { plate: null, frame: null, effect: null, material: 'none' } })
	assert.equal((await buy(luis, 'plate:aurora')).status(), 409, 'zero balance cannot buy')
	assert.equal((await equip(luis, 'plate', 'plate:aurora')).status(), 403, 'an unbought plate cannot be worn')
	assert.equal((await equip(luis, 'frame', 'frame:cinta')).status(), 403, 'an unbought frame cannot be worn')
	assert.equal((await equip(luis, 'frame', 'plate:grafito')).status(), 400, 'a plate does not go in the frame slot')
	const pass = await (await luis.context.request.get('/api/portal/pass')).json()
	assert.equal((await luis.context.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, frame: 'frame:oro-vivo' }, revision: pass.revision, completed: true } })).status(), 403, 'the pass save checks ownership too')
	assert.equal((await buy(luis, 'effect:eclipse')).status(), 403, 'profile effects are not for sale yet')
	assert.equal((await buy(luis, 'plate:grafito')).status(), 403, 'the free basics are not sold')
	assert.equal((await equip(luis, 'plate', 'plate:grafito')).status(), 200, 'the free basics are everyone\'s')
	assert.equal((await equip(luis, 'frame', 'frame:fino-gris')).status(), 200)

	// Dana earns exactly a rare plate and a rare frame, and buys both in the shop's tier list.
	const dana = await student('Dana Ríos', 'hades')
	await earn(dana, 500)
	const page = watch(await dana.context.newPage())
	await page.goto('/tienda')
	const wardrobe = page.getByTestId('shop-wardrobe')
	await wardrobe.waitFor()
	assert.equal(await wardrobe.locator('.shop-tier').count(), 4, 'four rarities')
	assert.deepEqual(await wardrobe.locator('.shop-tier__name strong').allInnerTexts(), ['Común', 'Rara', 'Épica', 'Legendaria'])
	assert.equal(await wardrobe.locator('.shop-slot').count(), 5, 'five slots')
	async function purchase(id) {
		const tile = wardrobe.getByTestId(`cosmetic-${id}`)
		await tile.scrollIntoViewIfNeeded()
		await tile.click()
		const item = wardrobe.locator('.shop-item[data-open]')
		await item.locator('.shop-item__act[data-mode="buy"]').click()
		const bought = page.waitForResponse((response) => response.url().endsWith('/cosmetic/buy'))
		await item.locator('.shop-item__act[data-mode="confirm"]').click()
		assert.equal((await bought).status(), 200)
		const worn = page.waitForResponse((response) => response.url().endsWith('/cosmetic/equip'))
		await item.locator('.shop-item__act[data-mode="wear"]').click()
		assert.equal((await worn).status(), 200)
		await item.locator('.shop-item__state').filter({ hasText: 'Puesto' }).waitFor()
	}
	await purchase('plate:aurora')
	// Buying shows on the counter at once.
	await page.getByTestId('shop-points').filter({ hasText: /^250$/ }).waitFor()
	await purchase('frame:cinta')
	await page.getByTestId('shop-points').filter({ hasText: /^0$/ }).waitFor()
	state = await shop(dana)
	assert.equal(state.points, 0, 'exact balance: 500 for two rares')
	assert.deepEqual(state.cosmetics.owned.sort(), ['frame:cinta', 'plate:aurora'])
	assert.deepEqual(state.cosmetics.equipped, { plate: 'plate:aurora', frame: 'frame:cinta', effect: null, material: 'none' })
	assert.equal((await buy(dana, 'plate:aurora')).status(), 409, 'one purchase per item')
	assert.equal((await buy(dana, 'plate:neon')).status(), 409, 'no balance left')
	assert.equal((await shop(dana)).points, 0)
	await wardrobe.locator('.shop-wear__row .plate[data-plate="aurora"]').waitFor()
	await wardrobe.locator('.shop-wear__card .card-frame[data-frame="cinta"]').waitFor()
	await page.waitForTimeout(1500)
	await wardrobe.locator('#shop-wear-title').scrollIntoViewIfNeeded()
	await page.screenshot({ path: `${OUT}/tienda-ranuras.png` })
	await wardrobe.locator('.shop-tier[data-rarity="epica"]').scrollIntoViewIfNeeded()
	await page.waitForTimeout(2500)
	await page.screenshot({ path: `${OUT}/tienda-tier-list.png` })

	// Leo sees it in Alumnos: the animated plate behind her name and the frame on her mini.
	const list = watch(await teacher.newPage())
	await list.goto('/alumnos')
	const row = list.locator('.portal-student').filter({ hasText: dana.username })
	await row.locator('.plate[data-plate="aurora"]').waitFor()
	await row.locator('.card-frame[data-frame="cinta"]').waitFor()
	assert.equal(await row.locator('.plate[data-plate="aurora"] .plate__name').innerText(), 'Dana Ríos')
	assert.equal(await list.locator('.portal-student').filter({ hasText: luis.username }).locator('.plate[data-plate="flat"]').count(), 1)
	assert.equal(await list.evaluate(() => document.querySelectorAll('canvas').length), 0, 'no live WebGL in the list')
	const roster = await (await teacher.request.get('/api/portal/roster')).json()
	assert.deepEqual((({ plate, frame }) => ({ plate, frame }))(roster.students.find((s) => s.id === dana.id)), { plate: 'plate:aurora', frame: 'frame:cinta' })
	await row.scrollIntoViewIfNeeded()
	await list.waitForTimeout(1200)
	await list.screenshot({ path: `${OUT}/lista-maestro.png` })

	// Her pass in the profile wears the frame.
	const profile = watch(await dana.context.newPage())
	await profile.goto('/perfil')
	await profile.locator('.pass-card .card-frame[data-frame="cinta"][data-hero]').first().waitFor()
	await profile.waitForTimeout(1500)
	await profile.screenshot({ path: `${OUT}/pase-marco.png` })

	// On the canvas, the list of connected students shows the plate too.
	const canvas = watch(await dana.context.newPage())
	await canvas.goto(`/board/${board.id}`)
	await canvas.waitForFunction(() => !!window.__xpCanvasEditor)
	await teacherPage.reload()
	await teacherPage.waitForFunction(() => !!window.__xpCanvasEditor)
	const toggle = teacherPage.locator('button.connected-students__toggle[aria-expanded]')
	if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
	await teacherPage.locator(`.connected-students li[data-user-id="${dana.id}"] .plate[data-plate="aurora"]`).waitFor()
	await teacherPage.waitForTimeout(800)
	await teacherPage.locator('.connected-students__panel').screenshot({ path: `${OUT}/canvas-conectados.png` })

	assert.deepEqual(errors, [])
	console.log(`Cosmetics smoke passed. Captures in ${OUT}`)
} finally {
	await browser.close()
}
