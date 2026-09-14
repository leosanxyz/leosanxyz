import { type Editor } from 'tldraw'

/** Opt-in, development-only trace of input routing; no coordinates or document data. */
export function installInputDiagnostic(editor: Editor, isSnapHeld: () => boolean) {
	const records: unknown[] = []
	const started = performance.now()
	const run = `snap-${Date.now()}`
	let moveCount = 0
	const targetName = (target: EventTarget | null) => target instanceof Element
		? target.getAttribute('data-testid') || target.tagName + '.' + [...target.classList].slice(0, 2).join('.')
		: null
	const state = () => ({ held: isSnapHeld(), tool: editor.getPath(),
		pinch: editor.inputs.getIsPinching(), pointing: editor.inputs.getIsPointing(),
		penMode: editor.getInstanceState().isPenMode, focused: editor.getIsFocused() })
	const log = (event: Event) => {
		if (records.length >= 160) return
		if (event.type.endsWith('move') && ++moveCount % 8 !== 0) return
		const entry: Record<string, unknown> = { t: Math.round(performance.now() - started),
			event: event.type, target: targetName(event.target), before: state() }
		if (event instanceof PointerEvent) Object.assign(entry, { pointer: event.pointerType,
			id: event.pointerId, primary: event.isPrimary, buttons: event.buttons })
		if (event instanceof TouchEvent) entry.touches = Array.from(event.touches).map(touch => ({
			id: touch.identifier, target: targetName(touch.target),
			type: (touch as Touch & { touchType?: string }).touchType,
		}))
		window.setTimeout(() => {
			Object.assign(entry, { prevented: event.defaultPrevented, handled: editor.wasEventAlreadyHandled(event), after: state() })
			records.push(entry)
		})
	}
	const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
		'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchmove', 'touchend',
		'touchcancel', 'focusin', 'focusout', 'gesturestart', 'gestureend']
	records.push({ event: 'start', run, userAgent: navigator.userAgent, state: state() })
	const flush = () => {
		if (!records.length) return
		const batch = records.splice(0, 160)
		void fetch('/api/input-diagnostic', { method: 'POST',
			headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run, records: batch }),
		}).catch(() => {})
	}
	for (const type of types) window.addEventListener(type, log, true)
	const interval = window.setInterval(flush, 700)
	const dispose = () => {
		for (const type of types) window.removeEventListener(type, log, true)
		window.clearInterval(interval)
		window.clearTimeout(timeout)
		flush()
	}
	const timeout = window.setTimeout(dispose, 90_000)
	return dispose
}
