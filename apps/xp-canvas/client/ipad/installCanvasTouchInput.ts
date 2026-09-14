import { type Editor } from 'tldraw'

/** Keep Pencil pointer input separate from Safari's document-wide touch list. */
export function installCanvasTouchInput(editor: Editor, isSnapHeld: () => boolean) {
	const container = editor.getContainer()
	const handleTouch = (event: Event) => {
		const target = event.target
		if (!(target instanceof Element) || !target.closest('.tl-canvas')) return
		// Let native media controls and resource links receive taps on Safari.
		if (target.closest('audio, video, .resource-shape a')) return

		if (isSnapHeld()) {
			// The list can contain both the Pencil on the canvas and the finger on
			// Snap. Do not let the pinch recognizer interrupt PointerEvent drawing.
			if (event.cancelable) event.preventDefault()
			event.stopPropagation()
			return
		}

		// tldraw's React touch handlers call preventDefault, but React attaches
		// passive touch listeners. Do that cancellation in this native listener;
		// allow propagation so tldraw's native two-finger zoom still receives it.
		if (event.type !== 'touchstart' && event.type !== 'touchend') return
		if (editor.wasEventAlreadyHandled(event)) return
		const editingShapeId = editor.getEditingShapeId()
		const isEditingTarget = editingShapeId && target.closest(`[data-shape-id="${editingShapeId}"]`)
		const isEditable = (target instanceof HTMLElement && target.isContentEditable) ||
			target.matches('input, textarea, .tlui-slider__thumb')
		const allowTouchEnd = event.type === 'touchend' &&
			(!(target instanceof HTMLElement) || isEditingTarget || target.tagName === 'A' || isEditable)
		if (!allowTouchEnd && event.cancelable) event.preventDefault()
		editor.markEventAsHandled(event)
	}

	const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel',
		'gesturestart', 'gesturechange', 'gestureend'] as const
	for (const name of events) {
		container.addEventListener(name, handleTouch, { capture: true, passive: false })
	}
	return () => {
		for (const name of events) container.removeEventListener(name, handleTouch, true)
	}
}
