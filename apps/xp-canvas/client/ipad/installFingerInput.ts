import { type Editor, type TLShapeId, type TLPointerEventInfo } from 'tldraw'

interface Contact { x: number; y: number; startX: number; startY: number }
type CameraGesture = { kind: 'pan'; x: number; y: number; camera: { x: number; y: number; z: number }; moved: boolean }
	| { kind: 'pinch'; distance: number; zoom: number; anchor: { x: number; y: number } }
	| { kind: 'select'; pointerId: number }

const interactive = 'button, a, input, textarea, audio, video, [contenteditable="true"], .tlui-slider'

/** Pencil draws normally. Touch owns selection/pan/pinch, independently of tldraw's pen-mode flag. */
export function installFingerInput(editor: Editor, isSnapHeld: () => boolean) {
	const container = editor.getContainer(), doc = container.ownerDocument
	const contacts = new Map<number, Contact>()
	let gesture: CameraGesture | null = null
	let penId: number | null = null
	let restorePenTool: string | null = null
	let selectionBefore: TLShapeId[] = []
	let frame = 0, lastTouchAt = 0

	function suppress(event: Event) {
		editor.markEventAsHandled(event)
		if (event.cancelable) event.preventDefault()
		event.stopPropagation()
	}
	function canvasTarget(event: Event, continuing = false) {
		const target = event.target
		if (!(target instanceof Element)) return false
		// Captured contacts may target the outer container. A second finger may also
		// land over a video while the first finger is already panning the canvas.
		if (continuing && target === container) return true
		return Boolean(target.closest('.tl-canvas')) && (!target.closest(interactive) || continuing && Boolean(target.closest('video, audio, .canvas-video')))
	}
	function send(event: PointerEvent, name: TLPointerEventInfo['name']) {
		editor.dispatch({ type: 'pointer', target: 'canvas', name,
			point: { x: event.clientX, y: event.clientY, z: .5 }, pointerId: event.pointerId, button: 0,
			isPen: editor.getInstanceState().isPenMode, isPenDirect: false,
			shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, accelKey: event.ctrlKey || event.metaKey,
		})
	}
	function cameraFrame() {
		frame = 0
		if (!gesture || editor.getCameraOptions().isLocked) return
		const points = [...contacts.values()]
		if (gesture.kind === 'pan' && points.length === 1) {
			const dx = points[0].x - gesture.x, dy = points[0].y - gesture.y
			if (Math.hypot(dx, dy) > 4) gesture.moved = true
			if (gesture.moved) editor.setCamera({ ...gesture.camera, x: gesture.camera.x + dx / gesture.camera.z, y: gesture.camera.y + dy / gesture.camera.z }, { immediate: true })
		} else if (gesture.kind === 'pinch' && points.length >= 2) {
			const [a, b] = points, bounds = editor.getViewportScreenBounds()
			const steps = editor.getCameraOptions().zoomSteps, base = editor.getBaseZoom()
			const ratio = Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance
			const z = Math.max(steps[0] * base, Math.min(steps[steps.length - 1] * base, gesture.zoom * ratio))
			editor.setCamera({ x: ((a.x + b.x) / 2 - bounds.x) / z - gesture.anchor.x, y: ((a.y + b.y) / 2 - bounds.y) / z - gesture.anchor.y, z }, { immediate: true })
		}
	}
	function releaseCaptures() {
		for (const id of contacts.keys()) if (container.hasPointerCapture(id)) container.releasePointerCapture(id)
	}
	function cancelSelection() {
		if (gesture?.kind !== 'select' || editor.isDisposed) return
		const contact = contacts.get(gesture.pointerId)
		editor.cancel()
		if (contact) send(new PointerEvent('pointerup', { pointerId: gesture.pointerId, clientX: contact.x, clientY: contact.y }), 'pointer_up')
		editor.setSelectedShapes(selectionBefore)
	}
	function cancelTouch() {
		delete container.dataset.fingerNavigating
		cancelAnimationFrame(frame); frame = 0
		cancelSelection()
		gesture = null
		releaseCaptures(); contacts.clear()
		editor.cancelDoubleClick()
	}
	function beginPinch() {
		cancelAnimationFrame(frame); frame = 0
		cancelSelection()
		editor.cancelDoubleClick(); editor.stopCameraAnimation(); editor.stopFollowingUser()
		const [a, b] = [...contacts.values()]
		gesture = { kind: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: editor.getZoomLevel(), anchor: editor.screenToPage({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) }
	}

	function down(event: PointerEvent) {
		if (event.target instanceof Element && event.target.closest('[data-testid^="tools."]')) restorePenTool = null
		if (!canvasTarget(event, event.pointerType === 'touch' && contacts.size > 0)) return
		if (event.pointerType === 'pen') {
			cancelTouch()
			if (restorePenTool && editor.getCurrentToolId() === 'select') editor.setCurrentTool(restorePenTool)
			restorePenTool = null; penId = event.pointerId
			return
		}
		if (event.pointerType !== 'touch') return
		suppress(event); lastTouchAt = performance.now()
		// Contact size is not a palm detector: an ordinary thumb can exceed 45px.
		// Reject palms only while Pencil is actually touching the canvas.
		if (penId !== null || isSnapHeld()) return
		if (contacts.size === 1 && gesture?.kind === 'pan') {
			cancelAnimationFrame(frame); cameraFrame()
		}
		contacts.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY })
		container.dataset.fingerNavigating = 'true'
		container.setPointerCapture(event.pointerId)
		if (contacts.size >= 2) { if (contacts.size === 2) beginPinch(); return }
		selectionBefore = [...editor.getSelectedShapeIds()]
		editor.stopCameraAnimation(); editor.stopFollowingUser()
		const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
		const hit = editor.getShapeAtPoint(point, { hitInside: true, margin: 6 / editor.getZoomLevel(), renderingOnly: true })
		const overlay = editor.overlays.getOverlayAtPoint(point, editor.getHitTestMargin())
		if (!editor.getIsReadonly() && (hit || overlay)) {
			if (!restorePenTool) restorePenTool = editor.getCurrentToolId()
			editor.setCurrentTool('select'); editor.cancelDoubleClick()
			gesture = { kind: 'select', pointerId: event.pointerId }
			send(event, 'pointer_down')
		} else gesture = { kind: 'pan', x: event.clientX, y: event.clientY, camera: { ...editor.getCamera() }, moved: false }
	}
	function move(event: PointerEvent) {
		if (event.pointerType !== 'touch') return
		const contact = contacts.get(event.pointerId)
		if (!contact) { if (penId !== null && canvasTarget(event)) suppress(event); return }
		suppress(event)
		contact.x = event.clientX; contact.y = event.clientY
		if (gesture?.kind === 'select') send(event, 'pointer_move')
		else if (!frame) frame = requestAnimationFrame(cameraFrame)
	}
	function up(event: PointerEvent) {
		if (event.pointerType === 'pen') { if (penId === event.pointerId) penId = null; return }
		if (!contacts.has(event.pointerId)) return
		suppress(event); lastTouchAt = performance.now()
		const cancelled = event.type === 'pointercancel'
		const contact = contacts.get(event.pointerId)!
		contact.x = event.clientX; contact.y = event.clientY
		cancelAnimationFrame(frame); cameraFrame()
		if (gesture?.kind === 'select') {
			if (cancelled) cancelSelection()
			else { editor.cancelDoubleClick(); send(event, 'pointer_up'); editor.cancelDoubleClick() }
		} else if (gesture?.kind === 'pan' && !gesture.moved && !cancelled) editor.setSelectedShapes([])
		contacts.delete(event.pointerId)
		if (!contacts.size) delete container.dataset.fingerNavigating
		if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId)
		if (contacts.size >= 2) beginPinch()
		else if (contacts.size === 1) {
			const remaining = [...contacts.values()][0]
			gesture = { kind: 'pan', x: remaining.x, y: remaining.y, camera: { ...editor.getCamera() }, moved: true }
		} else gesture = null
	}
	function nativeTouch(event: Event) {
		if (!canvasTarget(event, contacts.size > 0)) return
		if (event.type.startsWith('gesture') && contacts.size === 0 && penId === null && performance.now() - lastTouchAt > 500) return
		// Only PointerEvents count contacts, so Safari's touch list cannot mistake Pencil + finger for a pinch.
		suppress(event)
	}
	function contextMenu(event: Event) {
		if (performance.now() - lastTouchAt < 800 && canvasTarget(event)) suppress(event)
	}
	function blur() { penId = null; cancelTouch() }
	doc.addEventListener('pointerdown', down, { capture: true, passive: false })
	doc.addEventListener('pointermove', move, { capture: true, passive: false })
	doc.addEventListener('pointerup', up, { capture: true, passive: false })
	doc.addEventListener('pointercancel', up, { capture: true, passive: false })
	const nativeEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend']
	for (const name of nativeEvents) container.addEventListener(name, nativeTouch, { capture: true, passive: false })
	container.addEventListener('contextmenu', contextMenu, true)
	window.addEventListener('blur', blur)
	return () => {
		cancelTouch()
		doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointermove', move, true)
		doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true)
		for (const name of nativeEvents) container.removeEventListener(name, nativeTouch, true)
		container.removeEventListener('contextmenu', contextMenu, true); window.removeEventListener('blur', blur)
	}
}
