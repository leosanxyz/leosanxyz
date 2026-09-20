import assert from 'node:assert/strict'
import { SKINS } from '../shared/pass.ts'

export async function verifyProfileRefinements(page) {
	const before = await (await page.request.get('/api/portal/pass')).json()
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await page.setViewportSize({ width: 1440, height: 768 })
	await page.goto('/perfil')
	const card = page.locator('.profile-card-stage .pass-carousel-card[data-selected="true"] .pass-card')
	await page.getByRole('button', { name: 'Personalizar mi pase', exact: true }).click()
	await page.locator('.profile-account-panel').waitFor({ state: 'detached' })
	assert.equal(await page.getByRole('button', { name: /Silenciar sonido|Activar sonido/ }).count(), 0)
	const anchor = await card.boundingBox()
	assert(anchor.x < 350 && anchor.width <= 301, 'the compact card starts at the left of the profile')
	for (let i = 0; i <= SKINS.length; i++) {
		await page.locator('.pass-carousel-card[data-selected="true"]').press('ArrowRight')
		await page.waitForFunction(() => Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pass-carousel-card[data-selected="true"] > div')).transform).m41) < .1)
		await page.locator('.pass-carousel-card[data-selected="true"] .pass-art img').evaluate(async (img) => { await img.decode(); if (!img.naturalWidth) throw new Error('Cover did not load') })
		assert(await page.locator('.pass-carousel-card').evaluateAll((nodes) => {
			const selected = nodes.find((el) => el.dataset.selected === 'true').querySelector('.pass-card').getBoundingClientRect()
			return nodes.filter((el) => el.dataset.selected !== 'true').every((el) => Number(getComputedStyle(el.firstElementChild).opacity) < .01 || el.querySelector('.pass-card').getBoundingClientRect().x > selected.x)
		}), 'all visible alternatives stay to the right, including the loop seam')
	}
	const paint = await page.evaluate(async () => {
		const stage = document.querySelector('.profile-card-stage'), samples = [], start = performance.now()
		document.querySelector('.profile-pass-flip').click()
		await new Promise((resolve) => {
			function frame() {
				const r = stage.getBoundingClientRect(), faces = [...stage.querySelectorAll('.pass-carousel-card[data-selected="true"] .pass-face')].map((e) => e.getBoundingClientRect())
				samples.push(faces.every((f) => f.top > r.top + 12 && f.bottom < r.bottom - 12))
				if (performance.now() - start < 650) requestAnimationFrame(frame); else resolve()
			} requestAnimationFrame(frame)
		})
		return { padded: samples.every(Boolean), mask: getComputedStyle(stage).maskImage, blur: getComputedStyle(stage, '::after').backdropFilter }
	})
	assert(paint.padded, 'the turning faces and their shadows have vertical paint space')
	assert(paint.mask.includes('linear-gradient') && paint.blur.includes('blur'), 'carousel edges fade and blur')
	await page.getByRole('button', { name: 'Girar pase', exact: true }).click()
	await selectProfileSkin(page, 'halo')
	await page.getByRole('button', { name: 'Arrastrar Estrella', exact: true }).press('Enter')
	await selectProfileSkin(page, 'xp')
	assert.equal(await card.locator('.pass-sticker').count(), before.draft.skin === 'xp' ? before.draft.stickers.length : before.draft.stickersBySkin?.xp?.length ?? 0, 'stickers do not follow the cover selection')
	await page.getByRole('button', { name: 'Arrastrar Corazón', exact: true }).press('Enter')
	await selectProfileSkin(page, 'halo')
	assert.equal(await card.locator('.pass-sticker').count(), 1)
	const star = card.getByRole('button', { name: /^Sticker Estrella/ })
	const origin = await star.boundingBox(), stage = await page.locator('.profile-card-stage').boundingBox()
	const destination = { x: stage.x + stage.width + 35, y: origin.y + origin.height / 2 }
	await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2)
	await page.mouse.down(); await page.mouse.move(destination.x, destination.y, { steps: 16 })
	const preview = page.locator('body > .pass-sticker-drag-preview')
	await preview.waitFor()
	const visual = await preview.locator('> div').boundingBox()
	assert(Math.abs(visual.x + visual.width / 2 - destination.x) < 3, 'dragged sticker remains visible outside the carousel and tracks the pointer')
	assert.equal(await card.locator('.pass-sticker').evaluate((el) => getComputedStyle(el).opacity), '0')
	await page.mouse.up()
	await preview.waitFor({ state: 'detached' })
	await page.locator('body > .pass-poof').waitFor()
	assert.equal(await card.locator('.pass-sticker').count(), 0)
	await page.getByRole('button', { name: 'Arrastrar Estrella', exact: true }).press('Enter')
	for (const [width, height] of [[1440, 900], [1440, 768], [1280, 720], [1024, 768], [850, 768], [390, 844], [320, 700]]) {
		await page.setViewportSize({ width, height })
		await page.mouse.move(0, 0)
		await page.evaluate(() => document.querySelector('.board-main').scrollTop = 0)
		const save = await page.getByRole('button', { name: 'Guardar cambios', exact: true }).boundingBox(), cancel = await page.getByRole('button', { name: 'Cancelar', exact: true }).boundingBox()
		const current = await card.boundingBox()
		assert(save.y >= 0 && save.y + save.height <= height, `Save remains visible at ${width}x${height}`)
		assert(Math.abs((cancel.x + save.x + save.width) / 2 - (current.x + current.width / 2)) < 2, 'Cancel and Save are centered beneath the card')
		assert(await page.locator('.board-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
	}
	await page.setViewportSize({ width: 1440, height: 768 })
	await page.mouse.move(0, 0)
	await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
	await page.locator('.portal-profile[data-editing="false"]').waitFor()
	await page.reload()
	await card.waitFor()
	assert.equal(await card.locator('.pass-sticker').count(), 1)
	await page.getByRole('button', { name: 'Personalizar mi pase', exact: true }).click()
	await selectProfileSkin(page, 'xp')
	assert.equal(await card.getByRole('button', { name: /^Sticker Corazón/ }).count(), 1, 'each cover survives Save and reload')
	await page.mouse.move(0, 0)
	const samples = await page.evaluate(async () => {
		const samples = [], start = performance.now()
		document.querySelector('.profile-save button').click()
		await new Promise((resolve) => {
			function frame() {
				const sample = { at: performance.now() - start }
				for (const [key, selector] of [['inventory', '.pass-sticker-inventory'], ['account', '.profile-account-panel']]) {
					const el = document.querySelector(selector)
					if (el) { const r = el.getBoundingClientRect(), css = getComputedStyle(el); sample[key] = { x: r.x, y: r.y, transform: css.transform, opacity: Number(css.opacity) } }
				}
				samples.push(sample)
				if (sample.at < 450) requestAnimationFrame(frame); else resolve()
			} requestAnimationFrame(frame)
		})
		return samples
	})
	for (const key of ['inventory', 'account']) {
		const frames = samples.map((s) => s[key]).filter(Boolean)
		assert(frames.length > 1 && frames.every((s) => s.transform === 'none'), `${key} crossfades without a layout transform`)
		assert(Math.max(...frames.map((s) => s.x)) - Math.min(...frames.map((s) => s.x)) < 1 && Math.max(...frames.map((s) => s.y)) - Math.min(...frames.map((s) => s.y)) < 1, `${key} does not slide while closing`)
	}
	const saved = await (await page.request.get('/api/portal/pass')).json()
	assert.equal((await page.request.put('/api/portal/pass', { data: { draft: before.draft, revision: saved.revision, completed: true } })).status(), 200, 'restore only this synthetic account')
	await page.reload(); await card.waitFor()
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.setViewportSize({ width: 1440, height: 900 })
}

export async function selectProfileSkin(page, skin) {
	const skins = SKINS
	for (let i = 0; i < skins.length; i++) {
		const selected = page.locator('.profile-card-stage .pass-carousel-card[data-selected="true"]')
		const current = await selected.locator('.pass-card').getAttribute('class')
		const index = skins.findIndex((id) => current.includes(`pass-skin-${id}`))
		if (index === skins.indexOf(skin)) return
		await selected.press(index < skins.indexOf(skin) ? 'ArrowRight' : 'ArrowLeft')
	}
	throw new Error(`Could not select ${skin} in the profile carousel`)
}

export async function verifyInlinePassEditor(page) {
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await page.setViewportSize({ width: 1440, height: 1050 })
	const url = page.url(), before = await (await page.request.get('/api/portal/pass')).json()
	const selectedCard = page.locator('.profile-card-stage .pass-carousel-card[data-selected="true"] .pass-card')
	const originalCard = await selectedCard.elementHandle()
	await page.getByRole('button', { name: 'Personalizar mi pase', exact: true }).click()
	await page.locator('.profile-account-panel').waitFor({ state: 'detached' })
	await page.getByRole('region', { name: 'Portadas del pase', exact: true }).waitFor()
	assert.equal(page.url(), url, 'editing stays in the same profile route')
	assert(await selectedCard.evaluate((node, original) => node === original, originalCard), 'the main card stays mounted when the carousel opens')
	assert.equal(await page.getByRole('button', { name: 'Personalizar mi pase', exact: true }).count(), 0)
	assert.equal(await page.getByRole('button', { name: 'Descargar imagen', exact: true }).count(), 1)
	const inventory = await page.locator('.pass-sticker-inventory').boundingBox(), stage = await page.locator('.profile-card-stage').boundingBox(), controls = await page.locator('.profile-edit-controls').boundingBox()
	assert(inventory.x >= stage.x + stage.width, 'stickers use the right-hand column')
	assert(controls.y >= (await selectedCard.boundingBox()).y + (await selectedCard.boundingBox()).height, 'hologram controls are below the card, outside its shadow padding')
	await selectProfileSkin(page, 'halo')
	const carouselCard = await selectedCard.boundingBox()
	await page.mouse.move(carouselCard.x + carouselCard.width * .8, carouselCard.y + carouselCard.height * .3)
	await page.mouse.down()
	await page.mouse.move(carouselCard.x + carouselCard.width * .1, carouselCard.y + carouselCard.height * .3, { steps: 20 })
	await page.mouse.up()
	assert(!(await selectedCard.getAttribute('class')).includes('pass-skin-halo'), 'dragging the carousel selects another cover')
	await selectProfileSkin(page, 'halo')
	await page.mouse.move(0, 0)
	await page.waitForFunction(() => {
		const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.profile-card-stage .pass-carousel-card[data-selected="true"] > div')).transform)
		return Math.abs(m.m41) < .1 && m.m11 > .999
	})
	const star = page.getByRole('button', { name: 'Arrastrar Estrella', exact: true })
	const origin = await star.boundingBox(), target = await selectedCard.boundingBox()
	await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2)
	await page.mouse.down()
	await page.mouse.move(target.x + target.width * .48, target.y + target.height * .4, { steps: 14 })
	await page.mouse.up()
	assert.equal(await selectedCard.locator('.pass-sticker').count(), (before.draft.skin === 'halo' ? before.draft.stickers : before.draft.stickersBySkin?.halo ?? []).length + 1)
	await selectedCard.getByRole('button', { name: /^Sticker / }).last().press('ArrowRight')
	assert((await selectedCard.getAttribute('class')).includes('pass-skin-halo'), 'sticker arrow keys do not change the skin')
	await page.getByRole('button', { name: 'Girar pase', exact: true }).click()
	await page.locator('.pass-sticker-inventory[inert]').waitFor()
	assert.equal(await selectedCard.getAttribute('data-back'), 'true')
	await page.getByRole('button', { name: 'Girar pase', exact: true }).click()
	await page.locator('.pass-sticker-inventory:not([inert])').waitFor()
	const failSave = (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Prueba de conexión interrumpida.' }) }) : route.continue()
	await page.route('**/api/portal/pass', failSave)
	await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
	await page.getByRole('alert').filter({ hasText: 'Prueba de conexión interrumpida.' }).waitFor()
	assert.equal(await page.locator('.portal-profile').getAttribute('data-editing'), 'true', 'failed save retains the editor and draft')
	await page.unroute('**/api/portal/pass', failSave)
	page.once('dialog', (dialog) => dialog.dismiss())
	await page.getByRole('button', { name: 'Todas', exact: true }).click()
	assert.equal(page.url(), url, 'unsaved changes guard internal navigation')
	await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
	await page.locator('.portal-profile[data-editing="false"]').waitFor()
	await page.locator('.pass-sticker-inventory').waitFor({ state: 'detached' })
	assert.deepEqual((await (await page.request.get('/api/portal/pass')).json()).draft, before.draft, 'cancel never writes the draft')
	assert((await selectedCard.getAttribute('class')).includes(`pass-skin-${before.draft.skin}`))
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.getByRole('button', { name: 'Personalizar mi pase', exact: true }).click()
	await page.locator('.profile-account-panel').waitFor({ state: 'detached' })
	for (const width of [1024, 850, 390, 320]) {
		await page.setViewportSize({ width, height: 1050 })
		assert(await page.locator('.board-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `inline profile overflow at ${width}px`)
		assert.equal(await page.locator('.profile-edit-controls').evaluate((el) => getComputedStyle(el).filter), 'none')
		assert.equal(await page.locator('.pass-sticker-inventory').evaluate((el) => getComputedStyle(el).filter), 'none')
	}
	await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
	await page.locator('.profile-account-panel').waitFor()
	await page.setViewportSize({ width: 1440, height: 900 })
}

// Shared by the isolated smoke and the live smoke, using only their synthetic account.
export async function verifyProfileControls(page) {
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await page.setViewportSize({ width: 1440, height: 900 })
	const card = page.locator('.pass-carousel-card[data-selected="true"] .pass-card'), tilt = card.locator('.pass-card-tilt')
	await card.waitFor()
	await page.mouse.move(0, 0)
	await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pass-carousel-card[data-selected="true"] .pass-card-tilt')).transform).isIdentity)
	const box = await card.boundingBox(), flip = await page.getByRole('button', { name: 'Girar pase', exact: true }).boundingBox()
	assert(box.width >= 260 && box.width <= 301, 'profile card is compact enough to leave space for the editor')
	assert(flip.y >= box.y + box.height, 'flip icon is below, outside the card')
	assert.equal(await page.getByRole('button', { name: 'Girar pase', exact: true }).evaluate((el) => getComputedStyle(el).borderTopWidth), '0px')
	for (const name of ['Personalizar mi pase', 'Descargar imagen']) {
		const button = await page.getByRole('button', { name, exact: true }).boundingBox()
		assert(button.x >= box.x + box.width / 2 && button.x + button.width <= box.x + box.width + 1, `${name} is inside the right edge`)
		assert(button.y >= box.y + box.height - 70 && button.y + button.height <= box.y + box.height + 1, `${name} is inside the bottom edge`)
	}
	assert(await page.locator('.profile-replay').evaluate((el) => {
		const style = getComputedStyle(el)
		return ['Top', 'Right', 'Bottom', 'Left'].every((side) => style[`border${side}Width`] === '1px' && style[`border${side}Color`] !== 'rgba(0, 0, 0, 0)')
	}), 'replay button has a complete border')
	await page.mouse.move(box.x + 25, box.y + 35)
	await page.waitForFunction(() => Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pass-carousel-card[data-selected="true"] .pass-card-tilt')).transform).m13) > .025)
	await page.mouse.move(0, 0)
	await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pass-carousel-card[data-selected="true"] .pass-card-tilt')).transform).isIdentity)
	for (const rapid of [false, true]) {
		const samples = await page.evaluate(async (rapid) => {
			const flip = document.querySelector('.profile-pass-flip'), card = document.querySelector('.pass-carousel-card[data-selected="true"] .pass-card')
			const samples = [], start = performance.now()
			flip.click()
			if (rapid) { setTimeout(() => flip.click(), 80); setTimeout(() => flip.click(), 160) }
			await new Promise((resolve) => {
				function sample() {
					const actions = card.querySelector('.pass-card-actions'), matrix = new DOMMatrixReadOnly(getComputedStyle(card.querySelector('.pass-card-flipper')).transform)
					samples.push({ at: performance.now() - start, angle: matrix.m11, opacity: Number(getComputedStyle(actions).opacity), inert: actions.inert, blur: getComputedStyle(actions).filter })
					if (performance.now() - start < 1050) requestAnimationFrame(sample)
					else resolve()
				}
				requestAnimationFrame(sample)
			})
			return samples
		}, rapid)
		const moving = samples.filter((s) => s.at > 130 && Math.abs(s.angle) < .96)
		assert(moving.length > 0, 'the card has a real animated turn')
		assert(moving.every((s) => s.inert && s.opacity < .03), 'controls stay hidden and inert during a turn, including interruptions')
		assert.equal(samples.at(-1).inert, false)
		assert(samples.at(-1).opacity > .99, 'controls return after the card settles')
	}
	const account = page.getByRole('button', { name: /^Cuenta de / }), menu = page.locator('.board-account-menu')
	await account.click()
	assert.equal(await menu.evaluate((el) => getComputedStyle(el).animationName), 'account-menu-in')
	await page.mouse.move(box.x, 24, { steps: 8 })
	await page.mouse.click(box.x, 24)
	await menu.waitFor({ state: 'hidden' })
	await account.focus(); await page.keyboard.press('Enter')
	await menu.waitFor()
	assert.equal(await menu.evaluate((el) => getComputedStyle(el).animationName), 'none', 'keyboard menu opens immediately')
	await page.keyboard.press('Escape')
	await menu.waitFor({ state: 'hidden' })
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.waitForFunction(() => document.querySelector('.pass-carousel-card[data-selected="true"] .pass-card').dataset.reduced === 'true')
	await page.mouse.move(box.x + 25, box.y + 35)
	assert.equal(await tilt.evaluate((el) => getComputedStyle(el).transform), 'none')
	await account.click()
	assert.equal(await menu.evaluate((el) => getComputedStyle(el).animationName), 'account-menu-fade-in')
	assert.equal(await menu.evaluate((el) => getComputedStyle(el).transform), 'none', 'reduced menu changes opacity only')
	await page.keyboard.press('Escape')
	await menu.waitFor({ state: 'hidden' })
}
