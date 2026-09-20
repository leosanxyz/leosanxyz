import { access } from 'node:fs/promises'
import { editorCode } from './test-config.mjs'
import { chromium, devices } from 'playwright-core'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5174'
const executablePath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const smokeId = `smoke-${Date.now()}`
const browserIssues = []

await access(executablePath)

const browser = await chromium.launch({
	executablePath,
	headless: true,
	args: ['--no-sandbox', '--disable-gpu'],
})

const viewerContext = await browser.newContext({ viewport: { width: 1024, height: 768 } })
const editorContext = await browser.newContext({ viewport: { width: 1180, height: 820 } })
const ipadContext = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
const viewerPage = await viewerContext.newPage()
const editorPage = await editorContext.newPage()
const ipadPage = await ipadContext.newPage()

try {
	await Promise.all([openCanvas(viewerPage), openCanvas(editorPage)])
	assert(await isReadonly(viewerPage), 'The first client should be a viewer')

	await editorPage.getByRole('button', { name: 'Editar' }).click()
	await editorPage.getByLabel('Código privado').fill(editorCode)
	await editorPage.getByRole('button', { name: 'Entrar', exact: true }).click()
	await editorPage.waitForFunction(() => window.__xpCanvasEditor?.getIsReadonly() === false)
	await waitForEditor(editorPage)
	assert(!(await isReadonly(editorPage)), 'The authenticated client should be an editor')

	await viewerPage.waitForFunction(() =>
		window.__xpCanvasEditor
			?.getCollaborators()
			.some((collaborator) => collaborator.userName.toLowerCase() === 'leo')
	)
	await verifyRemoteCursorMotion(editorPage, viewerPage)
	await verifyPencilHover(editorPage)
	await verifySnapHoldButton(editorPage)
	await verifyQuickShape(editorPage)
	await verifySnappedQuickShape(editorPage)

	const shapeId = await editorPage.evaluate((id) => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Editor is unavailable')
		editor.createShape({
			type: 'geo',
			x: 120,
			y: 90,
			props: { geo: 'rectangle', w: 180, h: 110 },
			meta: { smokeId: id },
		})
		const shape = editor.getCurrentPageShapes().find((candidate) => candidate.meta.smokeId === id)
		if (!shape) throw new Error('Smoke shape was not created')
		return shape.id
	}, smokeId)

	await viewerPage.waitForFunction(
		(id) =>
			window.__xpCanvasEditor
				?.getCurrentPageShapes()
				.some((shape) => shape.meta.smokeId === id),
		smokeId
	)

	const viewerWrite = await viewerPage.evaluate((id) => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Viewer editor is unavailable')
		try {
			editor.createShape({ type: 'geo', x: 0, y: 0, meta: { smokeId: `${id}-viewer` } })
		} catch {
			// A readonly store may reject before a record is created.
		}
		return editor.getCurrentPageShapes().some((shape) => shape.meta.smokeId === `${id}-viewer`)
	}, smokeId)
	assert(!viewerWrite, 'The viewer must not create shapes')

	const uploadUrl = await editorPage.evaluate(async () => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Editor is unavailable')
		const png = Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
			),
			(character) => character.charCodeAt(0)
		)
		const file = new File([png], 'smoke.png', { type: 'image/png' })
		const result = await editor.store.props.assets.upload({}, file)
		return result.src
	})
	const assetResponse = await editorContext.request.get(new URL(uploadUrl, baseUrl).toString())
	assert(assetResponse.ok(), `Uploaded image should be readable, received ${assetResponse.status()}`)

	await viewerPage.reload()
	await waitForEditor(viewerPage)
	await viewerPage.waitForFunction(
		(id) =>
			window.__xpCanvasEditor
				?.getCurrentPageShapes()
				.some((shape) => shape.meta.smokeId === id),
		smokeId
	)

	await editorPage.evaluate((id) => {
		const editor = window.__xpCanvasEditor
		const shape = editor?.getCurrentPageShapes().find((candidate) => candidate.meta.smokeId === id)
		if (editor && shape) editor.deleteShape(shape.id)
	}, smokeId)

	await openCanvas(ipadPage)
	assert(await isReadonly(ipadPage), 'The iPad client should start as a viewer')
	await unlockEditor(ipadPage)
	await verifyIpadToolbarLayout(ipadPage)
	await ipadPage.setViewportSize({ width: 600, height: 800 })
	await verifyIpadToolbarLayout(ipadPage)
	await ipadPage.setViewportSize({ width: 834, height: 1194 })
	await verifyIpadToolbarLayout(ipadPage)
	await ipadPage.setViewportSize({ width: 1194, height: 834 })
	await verifyIpadFingerInput(ipadPage, ipadContext)
	await verifyNativeSnapTouch(ipadPage)
	await verifyIpadToolSelectionAndStyles(ipadPage)
	await verifyGridSnap(ipadPage, ipadContext)
	const fingerFirstShape = await verifyIpadPencilAndSnap(ipadPage, ipadContext, true)
	await removeSmokeShapes(ipadPage, fingerFirstShape.smokeId)
	const ipadQuickShape = await verifyIpadPencilAndSnap(ipadPage, ipadContext)
	await verifyIpadUndoRedo(ipadPage, ipadQuickShape)
	await verifyPinchAfterSnap(ipadPage, ipadContext)
	await verifyIpadExitEditor(ipadPage)

	assert(browserIssues.length === 0, `Browser reported errors: ${browserIssues.join(' | ')}`)
	console.log(
		'Smoke passed: viewer, editor, presence, smooth cursors, Pencil hover, iPad toolbar, multitouch Snap, sync, persistence, image upload and QuickShape'
	)
} finally {
	await browser.close()
}

async function openCanvas(page) {
	page.on('pageerror', (error) => browserIssues.push(`Page error: ${error.message}`))
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserIssues.push(`Console ${message.type()}: ${message.text()}`)
		}
	})
	page.on('requestfailed', (request) => {
		// Leaving a board cancels its optional thumbnail upload by design.
		if (/\/api\/boards\/[^/]+\/thumbnail$/.test(request.url()) && request.failure()?.errorText === 'net::ERR_ABORTED') return
		browserIssues.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`)
	})
	const response = await page.goto(new URL('/board/principal', baseUrl).href, { waitUntil: 'domcontentloaded' })
	assert(response?.ok(), `Canvas returned HTTP ${response?.status()}`)
	await waitForEditor(page)
}

async function waitForEditor(page) {
	try {
		await page.waitForFunction(
			() => window.tldrawReady === true && Boolean(window.__xpCanvasEditor),
			undefined,
			{ timeout: 15_000 }
		)
	} catch (error) {
		const state = await page.evaluate(() => ({
			title: document.title,
			text: document.body.innerText.slice(0, 500),
			tldrawReady: window.tldrawReady,
			hasEditor: Boolean(window.__xpCanvasEditor),
		}))
		throw new Error(`Canvas did not become ready: ${JSON.stringify(state)}`, { cause: error })
	}
}

async function unlockEditor(page) {
	await page.getByRole('button', { name: 'Editar' }).tap()
	await page.getByLabel('Código privado').fill(editorCode)
	await page.getByRole('button', { name: 'Entrar', exact: true }).tap()
	await page.getByTestId('ipad-toolbar').waitFor()
	await page.waitForFunction(() => window.__xpCanvasEditor?.getIsReadonly() === false)
}

async function verifyIpadToolbarLayout(page) {
	const expectedTools = [
		'select',
		'draw',
		'eraser',
		'line',
		'arrow',
		'rectangle',
		'ellipse',
		'triangle',
		'text',
		'asset',
		'hand',
	]
	const root = page.getByTestId('ipad-toolbar')
	const rootBox = await root.boundingBox()
	assert(rootBox, 'The iPad toolbar should be visible')
	const viewport = page.viewportSize()
	assert(viewport, 'The iPad viewport should be available')
	assert(
		rootBox.x <= 16 &&
			rootBox.y >= 0 &&
			rootBox.x + rootBox.width <= viewport.width &&
			rootBox.y + rootBox.height <= viewport.height,
		`The iPad toolbar should stay inside the left edge, found ${JSON.stringify(rootBox)}`
	)

	assert(await page.locator('.canvas-title, .connection').count() === 0,
		'The header should no longer display XP Canvas or En vivo')
	assert(await page.locator('.canvas-stage .tlui-menu-zone').count() === 0,
		'Page settings should move out of the drawing area')
	assert(await page.getByTestId('quick-actions.undo').count() === 0 &&
		await page.getByTestId('quick-actions.redo').count() === 0,
		'The iPad should not duplicate Undo/Redo in the header')
	for (const testId of ['main-menu.button', 'page-menu.button']) {
		const trigger = page.getByTestId(testId)
		const box = await trigger.boundingBox()
		const header = await page.locator('.canvas-header').boundingBox()
		assert(box && header && box.y >= header.y && box.y + box.height <= header.y + header.height,
			`${testId} should be inside the header`)
		await trigger.tap()
		if (testId === 'page-menu.button') await page.getByTestId('page-menu.list').waitFor()
		else await page.getByRole('menu').first().waitFor()
		await page.keyboard.press('Escape')
	}

	const gridButton = await page.getByTestId('canvas-grid-toggle').boundingBox()
	assert(gridButton && gridButton.width >= 44 && gridButton.height >= 44 &&
		gridButton.x + gridButton.width <= viewport.width &&
		viewport.width - gridButton.x - gridButton.width <= 24 &&
		gridButton.y + gridButton.height <= viewport.height &&
		viewport.height - gridButton.y - gridButton.height <= 70,
		'The grid toggle should have a finger-sized target at the bottom right')

	const drawingToolbar = page.getByRole('toolbar', { name: 'Herramientas de dibujo' })
	assert(
		(await drawingToolbar.getAttribute('aria-orientation')) === 'vertical',
		'The drawing toolbar should expose a vertical orientation'
	)

	const toolBoxes = []
	for (const toolId of expectedTools) {
		const button = page.getByTestId(`tools.${toolId}`)
		const box = await button.boundingBox()
		assert(box, `The ${toolId} tool should be visible on iPad`)
		assert(
			box.width >= 44 && box.height >= 44,
			`The ${toolId} tool should have a 44px touch target, found ${JSON.stringify(box)}`
		)
		toolBoxes.push(box)
	}
	const firstCenterX = toolBoxes[0].x + toolBoxes[0].width / 2
	assert(
		toolBoxes.every(
			(box, index) =>
				Math.abs(box.x + box.width / 2 - firstCenterX) < 1 &&
				(index === 0 || box.y > toolBoxes[index - 1].y)
		),
		'The iPad tools should form one ordered vertical column'
	)

	const styleBox = await page.getByTestId('mobile-styles.button').boundingBox()
	const undoBox = await page.getByTestId('ipad-toolbar.undo').boundingBox()
	const redoBox = await page.getByTestId('ipad-toolbar.redo').boundingBox()
	const snapBox = await page.getByTestId('ipad-toolbar.snap').boundingBox()
	for (const [name, box] of [
		['styles', styleBox],
		['undo', undoBox],
		['redo', redoBox],
		['snap', snapBox],
	]) {
		assert(box, `The ${name} control should be visible on iPad`)
		assert(
			box.width >= 44 && box.height >= 44,
			`The ${name} control should have a 44px touch target, found ${JSON.stringify(box)}`
		)
	}
	assert(
		undoBox.y < redoBox.y && redoBox.y < snapBox.y,
		'Undo, Redo and Snap should stay ordered at the bottom of the rail'
	)

	const layoutState = await page.evaluate(() => {
		const header = document.querySelector('.canvas-actions')
		const snap = document.querySelector('[data-testid="ipad-toolbar.snap"]')
		const footer = document.querySelector('.ipad-toolbar__footer')
		const scrollingElement = document.scrollingElement
		if (!(header instanceof HTMLElement) || !(snap instanceof HTMLElement)) {
			throw new Error('The iPad layout elements are unavailable')
		}
		return {
			header: {
				clientWidth: header.clientWidth,
				scrollWidth: header.scrollWidth,
				clientHeight: header.clientHeight,
				scrollHeight: header.scrollHeight,
				overflowX: getComputedStyle(header).overflowX,
				overflowY: getComputedStyle(header).overflowY,
			},
			documentWidth: scrollingElement?.scrollWidth ?? 0,
			viewportWidth: innerWidth,
			snapInsideToolScroller: Boolean(snap.closest('.ipad-toolbar__tools-scroll')),
			footerOverflow: footer ? getComputedStyle(footer).overflow : null,
		}
	})
	assert(
		layoutState.header.scrollWidth <= layoutState.header.clientWidth + 1 &&
			layoutState.header.scrollHeight <= layoutState.header.clientHeight + 1 &&
			layoutState.header.overflowX === 'visible' &&
			layoutState.header.overflowY === 'visible',
		`The header must not become a scroller, found ${JSON.stringify(layoutState.header)}`
	)
	assert(
		layoutState.documentWidth <= layoutState.viewportWidth + 1,
		`The iPad page should not overflow horizontally, found ${JSON.stringify(layoutState)}`
	)
	assert(
		!layoutState.snapInsideToolScroller && layoutState.footerOverflow === 'visible',
		`Snap must live outside every scrolling section, found ${JSON.stringify(layoutState)}`
	)
	assert(
		await page.locator('.header-quick-shape').isHidden(),
		'QuickShape should move out of the iPad header'
	)
	assert(
		await page.locator('.canvas-actions > .snap-hold').isHidden(),
		'Snap should move out of the iPad header'
	)

	assert(await page.getByTestId('editor-menu.trigger').count() === 0, 'No duplicate account menu inside the canvas')
}

async function verifyIpadFingerInput(page, context) {
	const button = page.getByTestId('tools.draw')
	await button.scrollIntoViewIfNeeded()
	const icon = button.locator('.tlui-icon')
	const iconBox = await icon.boundingBox()
	assert(iconBox && iconBox.width <= 24 && iconBox.height <= 24,
		`Toolbar glyphs should remain small, found ${JSON.stringify(iconBox)}`)

	// tldraw's edge guard examines finger radius and the exact event target.
	// A touch on a child icon must not be cancelled before Safari can emit click.
	const cancelled = await icon.evaluate((element) => {
		const rect = element.getBoundingClientRect()
		const touch = new Touch({ identifier: 91, target: element,
			clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2,
			radiusX: 40, radiusY: 24 })
		const event = new TouchEvent('touchstart', { bubbles: true, cancelable: true,
			touches: [touch], targetTouches: [touch], changedTouches: [touch] })
		element.dispatchEvent(event)
		return event.defaultPrevented
	})
	assert(!cancelled, 'A broad finger touch on a toolbar icon must preserve native click')

	const session = await context.newCDPSession(page)
	for (const id of ['draw', 'arrow', 'select']) {
		const target = page.getByTestId(`tools.${id}`)
		await target.scrollIntoViewIfNeeded()
		const box = await target.boundingBox()
		const point = { x: box.x + 8, y: box.y + box.height / 2, radiusX: 24, radiusY: 18, id: 1 }
		await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
		await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + 3 }] })
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
		await page.waitForFunction((tool) => window.__xpCanvasEditor?.getCurrentToolId() === tool, id)
	}
	// The short landscape rail must still scroll with a finger.
	await page.setViewportSize({ width: 1024, height: 700 })
	const scroller = page.locator('.ipad-toolbar__tools-scroll')
	await scroller.evaluate((element) => { element.scrollTop = 0 })
	const box = await scroller.boundingBox()
	for (let step = 0; step <= 10; step++) {
		await session.send('Input.dispatchTouchEvent', {
			type: step === 0 ? 'touchStart' : 'touchMove',
			touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height - 30 - step * 16, id: 1 }],
		})
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	await page.waitForFunction(() => document.querySelector('.ipad-toolbar__tools-scroll').scrollTop > 30)
	await scroller.evaluate((element) => new Promise((resolve) => {
		let last = element.scrollTop
		let stableFrames = 0
		function check() {
			stableFrames = Math.abs(element.scrollTop - last) < 0.1 ? stableFrames + 1 : 0
			last = element.scrollTop
			if (stableFrames >= 6) resolve(null)
			else requestAnimationFrame(check)
		}
		requestAnimationFrame(check)
	}))
	await session.detach()
	await page.setViewportSize({ width: 1194, height: 834 })
}

async function verifyNativeSnapTouch(page) {
	const snap = page.getByTestId('ipad-toolbar.snap')
	const cancelled = await snap.evaluate(button => {
		const touch = new Touch({ identifier: -42, target: button, clientX: 30, clientY: 400 })
		const pointer = new PointerEvent('pointerdown', { bubbles: true, cancelable: true,
			pointerType: 'touch', pointerId: -42, button: 0, buttons: 1 })
		button.dispatchEvent(pointer)
		const start = new TouchEvent('touchstart', { bubbles: true, cancelable: true,
			touches: [touch], targetTouches: [touch], changedTouches: [touch] })
		button.dispatchEvent(start)
		const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true,
			touches: [touch], targetTouches: [touch], changedTouches: [touch] })
		button.dispatchEvent(move)
		return [pointer.defaultPrevented, start.defaultPrevented, move.defaultPrevented]
	})
	assert(cancelled.every(value => !value), 'Snap must not cancel the finger event stream on Safari')
	await waitForSnapState(page, true)
	await snap.evaluate(button => {
		const other = new Touch({ identifier: -43, target: button })
		window.dispatchEvent(new TouchEvent('touchend', { changedTouches: [other] }))
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
	})
	await waitForSnapState(page, true)
	await snap.evaluate(button => {
		const owner = new Touch({ identifier: -42, target: button })
		window.dispatchEvent(new TouchEvent('touchcancel', { changedTouches: [owner] }))
	})
	await waitForSnapState(page, false)
}

async function verifyGridSnap(page, context) {
	const button = page.getByTestId('canvas-grid-toggle')
	await button.tap()
	await page.waitForFunction(() => window.__xpCanvasEditor.getInstanceState().isGridMode)
	await page.locator('.tl-grid').waitFor()
	assert(await button.getAttribute('aria-pressed') === 'true', 'Grid button should show its active state')
	const result = await verifyIpadPencilAndSnap(page, context, 'latched')
	const geometry = await page.evaluate(id => {
		const editor = window.__xpCanvasEditor
		const shape = editor.getShape(id)
		const origin = editor.getShapePageTransform(shape).applyToPoint({ x: 0, y: 0 })
		return { x: origin.x, y: origin.y, w: shape.props.w, h: shape.props.h,
			size: editor.getDocumentSettings().gridSize }
	}, result.id)
	for (const value of [geometry.x, geometry.y, geometry.w, geometry.h]) {
		assert(Math.abs(value / geometry.size - Math.round(value / geometry.size)) < 0.0001,
			`QuickShape should align to grid points, found ${JSON.stringify(geometry)}`)
	}
	await removeSmokeShapes(page, result.smokeId)
	await button.tap()
	await page.locator('.tl-grid').waitFor({ state: 'hidden' })
	assert(await button.getAttribute('aria-pressed') === 'false', 'Grid toggle should disable snapping too')
}

async function verifyIpadToolSelectionAndStyles(page) {
	for (const testCase of [
		{ id: 'draw', currentTool: 'draw' },
		{ id: 'arrow', currentTool: 'arrow' },
		{ id: 'text', currentTool: 'text' },
		{ id: 'rectangle', currentTool: 'geo', geo: 'rectangle' },
		{ id: 'select', currentTool: 'select' },
	]) {
		const button = page.getByTestId(`tools.${testCase.id}`)
		await button.tap()
		await page.waitForFunction(
			({ currentTool, geo }) => {
				const editor = window.__xpCanvasEditor
				if (!editor || editor.getCurrentToolId() !== currentTool) return false
				return !geo || editor.getInstanceState().stylesForNextShape['tldraw:geo'] === geo
			},
			{ currentTool: testCase.currentTool, geo: testCase.geo }
		)
		assert(
			(await button.getAttribute('aria-pressed')) === 'true',
			`The ${testCase.id} tool should expose its selected state`
		)
	}

	await page.getByTestId('tools.draw').tap()
	const styleButton = page.getByTestId('mobile-styles.button')
	await styleButton.tap()
	const stylePanel = page.locator('.tlui-style-panel')
	await stylePanel.waitFor()
	const toolbarBox = await page.getByTestId('ipad-toolbar').boundingBox()
	const panelBox = await stylePanel.boundingBox()
	assert(
		toolbarBox && panelBox && panelBox.x >= toolbarBox.x + toolbarBox.width,
		`The style panel should open to the right of the rail, found ${JSON.stringify(panelBox)}`
	)
	await page.getByTestId('style.color.red').tap()
	await page.getByTestId('style.size.l').tap()
	const styles = await page.evaluate(
		() => window.__xpCanvasEditor?.getInstanceState().stylesForNextShape
	)
	assert(
		styles?.['tldraw:color'] === 'red' && styles?.['tldraw:size'] === 'l',
		`The iPad style controls should update color and thickness, found ${JSON.stringify(styles)}`
	)
	await page.keyboard.press('Escape')
	await stylePanel.waitFor({ state: 'hidden' })

	const quickShape = page.getByTestId('ipad-toolbar.quick-shape')
	if ((await quickShape.getAttribute('aria-pressed')) !== 'true') await quickShape.tap()
	assert(
		(await quickShape.getAttribute('aria-pressed')) === 'true',
		'QuickShape should be enabled before the multitouch test'
	)
}

async function verifyIpadPencilAndSnap(page, context, snapFirst = false) {
	await page.getByTestId('tools.draw').tap()
	const stage = await page.locator('.canvas-stage').boundingBox()
	const snapBox = await page.getByTestId('ipad-toolbar.snap').boundingBox()
	if (!stage || !snapBox) throw new Error('The iPad canvas or Snap button is unavailable')

	const shapeIdsBefore = await page.evaluate(() => [
		...(window.__xpCanvasEditor?.getCurrentPageShapeIds() ?? []),
	])
	const quickShapeId = `ipad-pencil-snap-${Date.now()}`
	const points = rotatedRectanglePoints(
		stage.x + stage.width * 0.48,
		stage.y + stage.height * 0.44,
		220,
		132,
		Math.PI / 9,
		14
	)
	const snapPoint = {
		x: snapBox.x + snapBox.width / 2,
		y: snapBox.y + snapBox.height / 2,
	}
	const cdp = await context.newCDPSession(page)
	let penIsDown = false
	let touchIsDown = false
	let interactionError

	await page.evaluate(() => {
		window.__ipadSmokePointerCancels = []
		window.addEventListener(
			'pointercancel',
			(event) => {
				window.__ipadSmokePointerCancels.push({
					pointerId: event.pointerId,
					pointerType: event.pointerType,
				})
			},
			true
		)
	})

	try {
		if (snapFirst) {
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [{ id: 81, ...snapPoint, radiusX: 20, radiusY: 16, force: 1 }],
			})
			touchIsDown = true
			if (snapFirst === 'latched') {
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
				touchIsDown = false
			}
			await waitForSnapState(page, true)
		}
		await cdp.send('Input.dispatchMouseEvent', {
			type: 'mousePressed',
			x: points[0].x,
			y: points[0].y,
			button: 'left',
			buttons: 1,
			clickCount: 1,
			force: 0.55,
			pointerType: 'pen',
		})
		penIsDown = true
		if (snapFirst === true) await dispatchSafariMixedTouches(page, 'touchstart', points[0])
		for (const point of points.slice(1)) {
			if (snapFirst === true) await dispatchSafariMixedTouches(page, 'touchmove', point)
			await cdp.send('Input.dispatchMouseEvent', {
				type: 'mouseMoved',
				x: point.x,
				y: point.y,
				button: 'left',
				buttons: 1,
				force: 0.55,
				pointerType: 'pen',
			})
		}

		await page.waitForFunction(
			(ids) =>
				window.__xpCanvasEditor
					?.getCurrentPageShapes()
					.some((shape) => shape.type === 'draw' && !ids.includes(shape.id)),
			shapeIdsBefore
		)
		await page.evaluate(
			({ ids, smokeId }) => {
				const editor = window.__xpCanvasEditor
				const shape = editor
					?.getCurrentPageShapes()
					.find((candidate) => candidate.type === 'draw' && !ids.includes(candidate.id))
				if (!editor || !shape || shape.type !== 'draw') {
					throw new Error('The trusted Pencil stroke did not start')
				}
				editor.updateShape({
					id: shape.id,
					type: 'draw',
					meta: { ...shape.meta, quickShapeSmokeId: smokeId },
				})
			},
			{ ids: shapeIdsBefore, smokeId: quickShapeId }
		)

		const scrollBefore = await readIpadScroll(page)
		if (!snapFirst) {
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [
					{
						id: 81,
						x: snapPoint.x,
						y: snapPoint.y,
						radiusX: 1,
						radiusY: 1,
						force: 1,
					},
				],
			})
			touchIsDown = true
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [
					{
						id: 81,
						x: snapPoint.x - 10,
						y: snapPoint.y + 1,
						radiusX: 1,
						radiusY: 1,
						force: 1,
					},
				],
			})
		}
		if (snapFirst !== 'latched') await dispatchSafariMixedTouches(page, 'touchmove', points.at(-1))
		await waitForSnapState(page, true)

		const stateWhileHeld = await page.evaluate(() => ({
			isDrawing: window.__xpCanvasEditor?.isIn('draw.drawing') ?? false,
			pointerCancels: window.__ipadSmokePointerCancels,
		}))
		const scrollWhileHeld = await readIpadScroll(page)
		assert(
			stateWhileHeld.isDrawing && stateWhileHeld.pointerCancels.length === 0,
			`Snap should not cancel the active Pencil, found ${JSON.stringify(stateWhileHeld)}`
		)
		assert(
			JSON.stringify(scrollWhileHeld) === JSON.stringify(scrollBefore),
			`Holding Snap must not scroll the page or toolbar, found ${JSON.stringify({ scrollBefore, scrollWhileHeld })}`
		)

		await page.locator('.quick-shape-preview').waitFor({ state: 'visible', timeout: 3_000 })
	} catch (error) {
		interactionError = error
	} finally {
		if (penIsDown) {
			await cdp
				.send('Input.dispatchMouseEvent', {
					type: 'mouseReleased',
					x: points.at(-1).x,
					y: points.at(-1).y,
					button: 'left',
					buttons: 0,
					clickCount: 1,
					force: 0,
					pointerType: 'pen',
				})
				.catch(() => {})
		}
		if (touchIsDown) {
			await cdp
				.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
				.catch(() => {})
		}
	}

	if (snapFirst === 'latched') {
		await verifyPinchAfterSnap(page, context)
		await page.getByTestId('ipad-toolbar.snap').tap()
	}

	await waitForSnapState(page, false)
	if (interactionError) {
		await removeSmokeShapes(page, quickShapeId)
		throw new Error(`${snapFirst ? 'Finger' : 'Pencil'}-first multitouch Snap did not create a rectangle`, {
			cause: interactionError,
		})
	}

	const shape = await page.evaluate((smokeId) => {
		const match = window.__xpCanvasEditor
			?.getCurrentPageShapes()
			.find((candidate) => candidate.meta.quickShapeSmokeId === smokeId)
		if (!match || match.type !== 'geo') throw new Error('The iPad QuickShape is unavailable')
		return {
			id: match.id,
			type: match.type,
			geo: match.props.geo,
			color: match.props.color,
			size: match.props.size,
			rotation: match.rotation,
		}
	}, quickShapeId)
	const quarterTurn = Math.PI / 2
	const normalizedRotation = ((shape.rotation % quarterTurn) + quarterTurn) % quarterTurn
	const distanceToCardinal = Math.min(normalizedRotation, quarterTurn - normalizedRotation)
	assert(
		shape.geo === 'rectangle' &&
			shape.color === 'red' &&
			shape.size === 'l' &&
			distanceToCardinal < 0.001,
		`The iPad QuickShape should keep its styles and snap upright, found ${JSON.stringify(shape)}`
	)

	return { id: shape.id, smokeId: quickShapeId }
}

// Chromium CDP's pen stream omits Safari's parallel TouchEvents. Reproduce that
// extra stream explicitly: touches includes ALL contacts, even the one on UI.
async function dispatchSafariMixedTouches(page, type, point) {
	await page.evaluate(({ type, point }) => {
		const canvas = document.querySelector('.tl-canvas')
		const snap = document.querySelector('[data-testid="ipad-toolbar.snap"]')
		const rect = snap.getBoundingClientRect()
		const finger = new Touch({ identifier: 81, target: snap,
			clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 })
		const pencil = new Touch({ identifier: 82, target: canvas, clientX: point.x, clientY: point.y })
		canvas.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
			touches: [finger, pencil], targetTouches: [pencil], changedTouches: [pencil] }))
	}, { type, point })
}

async function verifyPinchAfterSnap(page, context) {
	const camera = await page.evaluate(() => ({ ...window.__xpCanvasEditor.getCamera() }))
	const box = await page.locator('.canvas-stage').boundingBox()
	const cdp = await context.newCDPSession(page)
	try {
		const center = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 }
		for (let i = 0; i <= 10; i++) {
			await cdp.send('Input.dispatchTouchEvent', {
				type: i === 0 ? 'touchStart' : 'touchMove',
				touchPoints: [
					{ id: 71, x: center.x - 40 - i * 6, y: center.y },
					{ id: 72, x: center.x + 40 + i * 6, y: center.y },
				],
			})
		}
		await page.waitForFunction((zoom) => Math.abs(window.__xpCanvasEditor.getZoomLevel() - zoom) > 0.05, camera.z)
	} finally {
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
		await page.waitForFunction(() => !window.__xpCanvasEditor.inputs.getIsPinching())
		await page.evaluate((camera) => { window.__xpCanvasEditor.setCamera(camera) }, camera)
		await cdp.detach()
	}
}

async function readIpadScroll(page) {
	return page.evaluate(() => {
		const header = document.querySelector('.canvas-actions')
		const tools = document.querySelector('.ipad-toolbar__tools-scroll')
		const scrollingElement = document.scrollingElement
		return {
			document: [scrollingElement?.scrollLeft ?? 0, scrollingElement?.scrollTop ?? 0],
			header: [header?.scrollLeft ?? 0, header?.scrollTop ?? 0],
			tools: [tools?.scrollLeft ?? 0, tools?.scrollTop ?? 0],
		}
	})
}

async function verifyIpadUndoRedo(page, { id, smokeId }) {
	const undo = page.getByTestId('ipad-toolbar.undo')
	const redo = page.getByTestId('ipad-toolbar.redo')
	await page.waitForFunction(
		() => !document.querySelector('[data-testid="ipad-toolbar.undo"]')?.hasAttribute('disabled')
	)
	await undo.tap()
	await page.waitForFunction(
		(tag) =>
			!window.__xpCanvasEditor
				?.getCurrentPageShapes()
				.some((shape) => shape.meta.quickShapeSmokeId === tag),
		smokeId
	)
	assert(!(await redo.isDisabled()), 'Redo should become available after tapping Undo')

	await redo.tap()
	await page.waitForFunction(
		({ shapeId, tag }) =>
			window.__xpCanvasEditor
				?.getCurrentPageShapes()
				.some((shape) => shape.id === shapeId && shape.meta.quickShapeSmokeId === tag),
		{ shapeId: id, tag: smokeId }
	)
	await page.evaluate((shapeId) => {
		window.__xpCanvasEditor?.deleteShape(shapeId)
	}, id)
}

async function verifyIpadExitEditor(page) {
	await page.getByRole('button', { name: 'Mis canvases', exact: true }).tap()
	await page.getByRole('button', { name: 'Cuenta de Espacio local', exact: true }).tap()
	await page.getByRole('menuitem', { name: 'Salir de edición', exact: true }).tap()
	await page.getByRole('link', { name: 'Ver Principal', exact: true }).tap()
	await page.waitForFunction(() => window.__xpCanvasEditor?.getIsReadonly() === true)
	await page.getByRole('button', { name: 'Editar' }).waitFor()
	assert(
		await page.getByTestId('ipad-toolbar').isHidden(),
		'The editing rail should disappear after Salir de edición'
	)
}

async function isReadonly(page) {
	return page.evaluate(() => window.__xpCanvasEditor?.getIsReadonly() ?? true)
}

async function verifyRemoteCursorMotion(sourcePage, targetPage) {
	await targetPage.emulateMedia({ reducedMotion: 'no-preference' })
	const stage = await sourcePage.locator('.canvas-stage').boundingBox()
	if (!stage) throw new Error('Source canvas stage is unavailable')

	const start = { x: stage.x + 130, y: stage.y + 150 }
	const end = { x: stage.x + 490, y: stage.y + 310 }
	await sourcePage.mouse.move(start.x, start.y)
	await targetPage.locator('.tl-collaborator__cursor').first().waitFor({ state: 'attached' })
	await targetPage.waitForFunction(() => {
		const cursor = document.querySelector('.tl-collaborator__cursor')
		return cursor instanceof HTMLElement && cursor.style.transform.length > 0
	})
	await targetPage.waitForTimeout(90)

	const animated = await readRemoteCursorTransition(targetPage)
	const movementPromise = sampleNextRemoteCursorMove(targetPage)
	await targetPage.waitForFunction(() => window.__smokeCursorObserverReady === true)
	await sourcePage.mouse.move(end.x, end.y)
	const movement = await movementPromise

	await targetPage.emulateMedia({ reducedMotion: 'reduce' })
	const reduced = await readRemoteCursorTransition(targetPage)
	await targetPage.emulateMedia({ reducedMotion: 'no-preference' })

	assert(
		animated.appliesToTransform &&
			Math.abs(animated.durationMs - 40) < 0.1 &&
			animated.timingFunction === 'linear',
		`Remote cursors should use a 40 ms linear transform transition, found ${JSON.stringify(animated)}`
	)
	assert(
		reduced.durationMs === 0,
		`Remote cursors must not animate with reduced motion, found ${JSON.stringify(reduced)}`
	)
	assert(
		movement.targetChanged && movement.uniqueComputedTransforms >= 2,
		`A real remote cursor should interpolate between presence updates, found ${JSON.stringify(movement)}`
	)
}

async function readRemoteCursorTransition(page) {
	return page.evaluate(() => {
		const cursor = document.querySelector('.tl-collaborator__cursor')
		if (!(cursor instanceof HTMLElement)) throw new Error('Remote cursor is unavailable')
		const style = getComputedStyle(cursor)
		const properties = style.transitionProperty.split(',').map((value) => value.trim())
		const durations = style.transitionDuration.split(',').map((value) => value.trim())
		const timingFunctions = style.transitionTimingFunction
			.split(',')
			.map((value) => value.trim())
		const propertyIndex = properties.findIndex(
			(property) => property === 'transform' || property === 'all'
		)
		const parseMilliseconds = (value) => {
			if (value.endsWith('ms')) return Number.parseFloat(value)
			if (value.endsWith('s')) return Number.parseFloat(value) * 1000
			return Number.NaN
		}
		const listValue = (values, index) => values[index % values.length]

		return {
			appliesToTransform: propertyIndex >= 0,
			durationMs:
				propertyIndex >= 0 ? parseMilliseconds(listValue(durations, propertyIndex)) : 0,
			timingFunction:
				propertyIndex >= 0 ? listValue(timingFunctions, propertyIndex) : null,
			transitionProperty: style.transitionProperty,
			transitionDuration: style.transitionDuration,
		}
	})
}

async function sampleNextRemoteCursorMove(page) {
	return page.evaluate(async () => {
		const cursor = document.querySelector('.tl-collaborator__cursor')
		if (!(cursor instanceof HTMLElement)) throw new Error('Remote cursor is unavailable')
		const initialTarget = cursor.style.transform
		window.__smokeCursorObserverReady = false

		await new Promise((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				observer.disconnect()
				reject(new Error('Remote cursor did not receive a new position'))
			}, 2_000)
			const observer = new MutationObserver(() => {
				if (cursor.style.transform === initialTarget) return
				window.clearTimeout(timeout)
				observer.disconnect()
				resolve()
			})
			observer.observe(cursor, { attributes: true, attributeFilter: ['style'] })
			window.__smokeCursorObserverReady = true
		})
		delete window.__smokeCursorObserverReady

		const target = cursor.style.transform
		const computedTransforms = []
		for (let frame = 0; frame < 7; frame++) {
			await new Promise((resolve) => requestAnimationFrame(resolve))
			computedTransforms.push(getComputedStyle(cursor).transform)
		}

		return {
			initialTarget,
			target,
			targetChanged: target !== initialTarget,
			uniqueComputedTransforms: new Set(computedTransforms).size,
			computedTransforms,
		}
	})
}

async function verifyPencilHover(page) {
	const moveResult = await dispatchPencilPreviewEvent(page, 'pointermove', {
		buttons: 0,
		pressure: 0,
	})
	await page.waitForFunction(
		() => getComputedStyle(document.querySelector('.pencil-hover-preview')).opacity === '1'
	)
	assert(
		moveResult.visible && !moveResult.transform.includes('-100px'),
		`Pencil hover should show its preview at the reported position, found ${JSON.stringify(moveResult)}`
	)

	const downResult = await dispatchPencilPreviewEvent(page, 'pointerdown', {
		buttons: 1,
		pressure: 0.5,
	})
	assert(!downResult.visible, 'Pencil contact should hide the hover preview')
	await waitForPencilPreviewOpacity(page, '0')

	const upResult = await dispatchPencilPreviewEvent(page, 'pointerup', {
		buttons: 0,
		pressure: 0,
	})
	assert(
		upResult.visible,
		'Pencil hover should return immediately when the tip leaves the screen'
	)
	await waitForPencilPreviewOpacity(page, '1')
	const leaveResult = await dispatchPencilPreviewEvent(page, 'pointerleave', {
		buttons: 0,
		pressure: 0,
	})
	assert(!leaveResult.visible, 'Pencil leave should hide the hover preview')
	await waitForPencilPreviewOpacity(page, '0')
}

async function dispatchPencilPreviewEvent(page, type, { buttons, pressure }) {
	return page.evaluate(
		async ({ eventType, eventButtons, eventPressure }) => {
			const stage = document.querySelector('.canvas-stage')
			const preview = document.querySelector('.pencil-hover-preview')
			if (!(stage instanceof HTMLElement) || !(preview instanceof HTMLElement)) {
				throw new Error('Pencil hover elements are unavailable')
			}

			const bounds = stage.getBoundingClientRect()
			stage.dispatchEvent(
				new PointerEvent(eventType, {
					bubbles: eventType !== 'pointerleave',
					composed: true,
					pointerId: 71,
					pointerType: 'pen',
					isPrimary: true,
					button: eventType === 'pointerdown' ? 0 : -1,
					buttons: eventButtons,
					pressure: eventPressure,
					clientX: bounds.left + 144,
					clientY: bounds.top + 96,
				})
			)
			await new Promise((resolve) => requestAnimationFrame(resolve))

			return {
				visible: preview.dataset.visible === 'true',
				transform: preview.style.transform,
			}
		},
		{ eventType: type, eventButtons: buttons, eventPressure: pressure }
	)
}

async function waitForPencilPreviewOpacity(page, opacity) {
	await page.waitForFunction(
		(expectedOpacity) =>
			getComputedStyle(document.querySelector('.pencil-hover-preview')).opacity === expectedOpacity,
		opacity
	)
}

async function verifySnapHoldButton(page) {
	const button = page.getByRole('button', { name: 'Snap' })
	const shapeCountBefore = await page.evaluate(
		() => window.__xpCanvasEditor?.getCurrentPageShapes().length
	)

	await dispatchSnapPointer(button, 'pointerdown', 81)
	await waitForSnapState(page, true)

	await dispatchSnapPointer(button, 'pointerup', 82)
	assert(
		(await button.getAttribute('aria-pressed')) === 'true',
		'An unrelated pointer must not release the held Snap button'
	)
	await dispatchSnapPointer(button, 'pointercancel', 82)
	await dispatchSnapPointer(button, 'lostpointercapture', 82)
	assert(
		(await button.getAttribute('aria-pressed')) === 'true',
		'Cancellation from another pointer must not release the held Snap button'
	)

	await page.locator('.canvas-stage').dispatchEvent('pointermove', {
		pointerId: 82,
		pointerType: 'pen',
		buttons: 0,
		pressure: 0,
	})
	assert(
		(await button.getAttribute('aria-pressed')) === 'true',
		'Pencil movement must not release a Snap gesture held by another pointer'
	)

	await dispatchSnapPointer(button, 'pointerup', 81)
	await waitForSnapState(page, false)

	await dispatchSnapPointer(button, 'pointerdown', 83)
	await waitForSnapState(page, true)
	const quickShapeToggle = page.locator('.header-quick-shape input')
	await quickShapeToggle.uncheck()
	await waitForSnapState(page, false)
	await quickShapeToggle.check()
	await dispatchSnapPointer(button, 'pointerdown', 84)
	await waitForSnapState(page, true)
	await dispatchSnapPointer(button, 'pointerup', 84)
	await waitForSnapState(page, false)
	await button.evaluate((element) => element.click())
	await waitForSnapState(page, true)
	await button.evaluate((element) => element.click())
	await waitForSnapState(page, false)

	const shapeCountAfter = await page.evaluate(
		() => window.__xpCanvasEditor?.getCurrentPageShapes().length
	)
	assert(
		shapeCountAfter === shapeCountBefore,
		'The Snap button gesture must not create or change canvas shapes'
	)
}

async function dispatchSnapPointer(button, type, pointerId) {
	await button.dispatchEvent(type, {
		pointerId,
		pointerType: 'mouse',
		isPrimary: pointerId === 81,
		button: type === 'pointerdown' ? 0 : -1,
		buttons: type === 'pointerdown' ? 1 : 0,
	})
}

async function waitForSnapState(page, held) {
	await page.waitForFunction(
		(expected) => {
			const visibleSnap = [...document.querySelectorAll('[aria-label="Snap"]')].find(
				(element) => element.getClientRects().length > 0
			)
			return visibleSnap?.getAttribute('aria-pressed') === String(expected)
		},
		held
	)
}

async function verifyQuickShape(page) {
	const stage = await page.locator('.canvas-stage').boundingBox()
	if (!stage) throw new Error('Canvas stage is unavailable')
	await verifyPointerCancellation(page, stage)

	const quickShapeId = `quick-shape-${Date.now()}`
	const points = rectanglePoints(stage.x + 220, stage.y + 170, 190, 125, 14)
	await page.evaluate(({ penPoints, smokeId }) => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Editor is unavailable')
		window.__quickShapeEditorProbe = editor
		const shapeIdsBefore = new Set(editor.getCurrentPageShapeIds())
		editor.setCurrentTool('draw')
		const base = {
			type: 'pointer',
			target: 'canvas',
			pointerId: 42,
			button: 0,
			isPen: true,
			isPenDirect: true,
			shiftKey: false,
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			accelKey: false,
		}
		editor.dispatch({ ...base, name: 'pointer_down', point: { ...penPoints[0], z: 0.55 } })
		const drawShape = editor
			.getCurrentPageShapes()
			.find((shape) => shape.type === 'draw' && !shapeIdsBefore.has(shape.id))
		if (!drawShape || drawShape.type !== 'draw') throw new Error('Synthetic stroke did not start')
		editor.updateShape({
			id: drawShape.id,
			type: 'draw',
			meta: { ...drawShape.meta, quickShapeSmokeId: smokeId },
		})
		for (const point of penPoints.slice(1)) {
			editor.dispatch({ ...base, name: 'pointer_move', point: { ...point, z: 0.55 } })
		}
		// Pointer moves are batched until the next editor event. Flush them, then advance
		// the same tick callback used by a real 500 ms Pencil hold.
		editor.dispatch({ type: 'misc', name: 'tick', elapsed: 0 })
		for (let tick = 0; tick < 6; tick++) editor.emit('tick', 100)
	}, { penPoints: points, smokeId: quickShapeId })

	let conversionError
	try {
		await page.locator('.quick-shape-preview').waitFor({ state: 'visible', timeout: 2_500 })
	} catch (error) {
		conversionError = error
	}

	await page.evaluate((point) => {
		window.__xpCanvasEditor?.dispatch({
			type: 'pointer',
			target: 'canvas',
			name: 'pointer_up',
			point: { ...point, z: 0 },
			pointerId: 42,
			button: 0,
			isPen: true,
			isPenDirect: true,
			shiftKey: false,
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			accelKey: false,
		})
	}, points.at(-1))

	if (conversionError) {
		await removeSmokeShapes(page, quickShapeId)
		throw new Error('Synthetic Apple Pencil hold did not create a rectangle', {
			cause: conversionError,
		})
	}

	await page.waitForTimeout(100)
	const undoResult = await page.evaluate((smokeId) => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Editor is unavailable')
		const canUndoBefore = editor.getCanUndo()
		editor.undo()
		const shapes = editor
			.getCurrentPageShapes()
			.filter((shape) => shape.meta.quickShapeSmokeId === smokeId)
			.map((shape) => ({ id: shape.id, type: shape.type }))
		const sameEditor = editor === window.__quickShapeEditorProbe
		delete window.__quickShapeEditorProbe
		return {
			canUndoBefore,
			canUndoAfter: editor.getCanUndo(),
			sameEditor,
			shapes,
		}
	}, quickShapeId)
	const shapesAfterUndo = undoResult.shapes
	if (shapesAfterUndo.length > 0) await removeSmokeShapes(page, quickShapeId)
	assert(
		undoResult.sameEditor && undoResult.canUndoBefore && shapesAfterUndo.length === 0,
		`QuickShape should remain one undo operation, found ${JSON.stringify(undoResult)}`
	)
}

async function verifySnappedQuickShape(page) {
	const stage = await page.locator('.canvas-stage').boundingBox()
	if (!stage) throw new Error('Canvas stage is unavailable')

	const quickShapeId = `quick-shape-snap-${Date.now()}`
	const snapPointerId = 91
	const penPointerId = 92
	const points = rotatedRectanglePoints(
		stage.x + stage.width * 0.56,
		stage.y + stage.height * 0.54,
		210,
		130,
		Math.PI / 9,
		14
	)
	const snapButton = page.getByRole('button', { name: 'Snap' })

	await dispatchSnapPointer(snapButton, 'pointerdown', snapPointerId)
	await waitForSnapState(page, true)

	let conversionError
	try {
		await page.evaluate(
			({ penPoints, smokeId, pointerId }) => {
				const editor = window.__xpCanvasEditor
				if (!editor) throw new Error('Editor is unavailable')
				window.__snappedQuickShapeEditorProbe = editor
				const shapeIdsBefore = new Set(editor.getCurrentPageShapeIds())
				editor.setCurrentTool('draw')
				const base = {
					type: 'pointer',
					target: 'canvas',
					pointerId,
					button: 0,
					isPen: true,
					isPenDirect: true,
					shiftKey: false,
					altKey: false,
					ctrlKey: false,
					metaKey: false,
					accelKey: false,
				}
				editor.dispatch({ ...base, name: 'pointer_down', point: { ...penPoints[0], z: 0.55 } })
				const drawShape = editor
					.getCurrentPageShapes()
					.find((shape) => shape.type === 'draw' && !shapeIdsBefore.has(shape.id))
				if (!drawShape || drawShape.type !== 'draw') {
					throw new Error('Synthetic snapped stroke did not start')
				}
				editor.updateShape({
					id: drawShape.id,
					type: 'draw',
					meta: { ...drawShape.meta, quickShapeSmokeId: smokeId },
				})
				for (const point of penPoints.slice(1)) {
					editor.dispatch({ ...base, name: 'pointer_move', point: { ...point, z: 0.55 } })
				}
				editor.dispatch({ type: 'misc', name: 'tick', elapsed: 0 })
				for (let tick = 0; tick < 6; tick++) editor.emit('tick', 100)
			},
			{ penPoints: points, smokeId: quickShapeId, pointerId: penPointerId }
		)

		await page.locator('.quick-shape-preview').waitFor({ state: 'visible', timeout: 2_500 })
	} catch (error) {
		conversionError = error
	}

	await page.evaluate(
		({ point, pointerId }) => {
			window.__xpCanvasEditor?.dispatch({
				type: 'pointer',
				target: 'canvas',
				name: 'pointer_up',
				point: { ...point, z: 0 },
				pointerId,
				button: 0,
				isPen: true,
				isPenDirect: true,
				shiftKey: false,
				altKey: false,
				ctrlKey: false,
				metaKey: false,
				accelKey: false,
			})
		},
		{ point: points.at(-1), pointerId: penPointerId }
	)
	await dispatchSnapPointer(snapButton, 'pointerup', snapPointerId)
	await waitForSnapState(page, false)

	if (conversionError) {
		await removeSmokeShapes(page, quickShapeId)
		throw new Error('Rotated QuickShape did not convert while Snap was held', {
			cause: conversionError,
		})
	}

	const snappedShape = await page.evaluate((smokeId) => {
		const shape = window.__xpCanvasEditor
			?.getCurrentPageShapes()
			.find((candidate) => candidate.meta.quickShapeSmokeId === smokeId)
		if (!shape || shape.type !== 'geo') throw new Error('Snapped QuickShape is unavailable')
		return { id: shape.id, type: shape.type, geo: shape.props.geo, rotation: shape.rotation }
	}, quickShapeId)
	const quarterTurn = Math.PI / 2
	const normalizedRotation =
		((snappedShape.rotation % quarterTurn) + quarterTurn) % quarterTurn
	const distanceToCardinal = Math.min(
		normalizedRotation,
		quarterTurn - normalizedRotation
	)
	assert(
		distanceToCardinal < 0.001,
		`Snap should make QuickShape rotation cardinal, found ${snappedShape.rotation}`
	)

	await page.waitForTimeout(100)
	const undoResult = await page.evaluate((smokeId) => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Editor is unavailable')
		const canUndoBefore = editor.getCanUndo()
		editor.undo()
		const shapes = editor
			.getCurrentPageShapes()
			.filter((shape) => shape.meta.quickShapeSmokeId === smokeId)
			.map((shape) => ({ id: shape.id, type: shape.type }))
		const sameEditor = editor === window.__snappedQuickShapeEditorProbe
		delete window.__snappedQuickShapeEditorProbe
		return { canUndoBefore, sameEditor, shapes }
	}, quickShapeId)
	if (undoResult.shapes.length > 0) await removeSmokeShapes(page, quickShapeId)
	assert(
		undoResult.sameEditor && undoResult.canUndoBefore && undoResult.shapes.length === 0,
		`Snapped QuickShape should remain one undo operation, found ${JSON.stringify(undoResult)}`
	)
}

async function verifyPointerCancellation(page, stage) {
	const cancelId = `quick-shape-cancel-${Date.now()}`
	const points = rectanglePoints(stage.x + 210, stage.y + 160, 180, 120, 12)
	const result = await page.evaluate(({ penPoints, smokeId }) => {
		const editor = window.__xpCanvasEditor
		if (!editor) throw new Error('Editor is unavailable')
		const shapeIdsBefore = new Set(editor.getCurrentPageShapeIds())
		editor.setCurrentTool('draw')
		const base = {
			type: 'pointer',
			target: 'canvas',
			pointerId: 41,
			button: 0,
			isPen: true,
			isPenDirect: true,
			shiftKey: false,
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			accelKey: false,
		}

		editor.dispatch({ ...base, name: 'pointer_down', point: { ...penPoints[0], z: 0.55 } })
		const drawShape = editor
			.getCurrentPageShapes()
			.find((shape) => shape.type === 'draw' && !shapeIdsBefore.has(shape.id))
		if (!drawShape || drawShape.type !== 'draw') throw new Error('Cancelled stroke did not start')
		editor.updateShape({
			id: drawShape.id,
			type: 'draw',
			meta: { ...drawShape.meta, quickShapeSmokeId: smokeId },
		})
		for (const point of penPoints.slice(1)) {
			editor.dispatch({ ...base, name: 'pointer_move', point: { ...point, z: 0.55 } })
		}
		editor.dispatch({ type: 'misc', name: 'tick', elapsed: 0 })
		window.dispatchEvent(
			new PointerEvent('pointercancel', {
				bubbles: true,
				pointerId: base.pointerId,
				pointerType: 'pen',
			})
		)
		for (let tick = 0; tick < 6; tick++) editor.emit('tick', 100)

		const matchingShapes = editor
			.getCurrentPageShapes()
			.filter((shape) => shape.meta.quickShapeSmokeId === smokeId)
			.map((shape) => ({ id: shape.id, type: shape.type }))
		const isIdle = editor.isIn('draw.idle')
		if (!isIdle) editor.cancel()
		for (const shape of editor.getCurrentPageShapes()) {
			if (shape.meta.quickShapeSmokeId === smokeId) editor.deleteShape(shape.id)
		}
		return { isIdle, matchingShapes }
	}, { penPoints: points, smokeId: cancelId })

	assert(
		result.isIdle && result.matchingShapes.every((shape) => shape.type === 'draw'),
		`A native pointercancel must stop QuickShape without converting the stroke, found ${JSON.stringify(result)}`
	)
}

async function removeSmokeShapes(page, smokeId) {
	await page.evaluate((id) => {
		const editor = window.__xpCanvasEditor
		if (!editor) return
		for (const shape of editor.getCurrentPageShapes()) {
			if (shape.meta.quickShapeSmokeId === id) editor.deleteShape(shape.id)
		}
	}, smokeId)
}

function rectanglePoints(x, y, width, height, samplesPerEdge) {
	const corners = [
		{ x, y },
		{ x: x + width, y },
		{ x: x + width, y: y + height },
		{ x, y: y + height },
		{ x, y },
	]
	const points = []
	for (let edge = 0; edge < corners.length - 1; edge++) {
		const start = corners[edge]
		const end = corners[edge + 1]
		for (let step = 0; step < samplesPerEdge; step++) {
			const progress = step / samplesPerEdge
			points.push({
				x: start.x + (end.x - start.x) * progress,
				y: start.y + (end.y - start.y) * progress,
			})
		}
	}
	points.push(corners.at(-1))
	return points
}

function rotatedRectanglePoints(centerX, centerY, width, height, rotation, samplesPerEdge) {
	const halfWidth = width / 2
	const halfHeight = height / 2
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const corners = [
		{ x: -halfWidth, y: -halfHeight },
		{ x: halfWidth, y: -halfHeight },
		{ x: halfWidth, y: halfHeight },
		{ x: -halfWidth, y: halfHeight },
		{ x: -halfWidth, y: -halfHeight },
	].map((point) => ({
		x: centerX + point.x * cos - point.y * sin,
		y: centerY + point.x * sin + point.y * cos,
	}))
	const points = []
	for (let edge = 0; edge < corners.length - 1; edge++) {
		const start = corners[edge]
		const end = corners[edge + 1]
		for (let step = 0; step < samplesPerEdge; step++) {
			const progress = step / samplesPerEdge
			points.push({
				x: start.x + (end.x - start.x) * progress,
				y: start.y + (end.y - start.y) * progress,
			})
		}
	}
	points.push(corners.at(-1))
	return points
}

function assert(condition, message) {
	if (!condition) throw new Error(message)
}
