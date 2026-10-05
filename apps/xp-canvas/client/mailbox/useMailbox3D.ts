import { useEffect, useRef, useState, type RefObject } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { MailboxAnchors, MailboxScene } from './mailboxScene'

const IDLE_FRAME_MS = 1000 / 30

export type Mailbox3DInput = {
	width: number
	height: number
	/** Escala de la figura en el canvas; junto con el zoom decide la nitidez. */
	scale: number
	full: boolean
	/** Momentos locales, en `performance.now()`. */
	arrivalAt: number | null
	drawAt: number | null
	landingAt: number | null
}
export type Mailbox3DStatus = 'loading' | 'ready' | 'failed'

/**
 * Dibuja el buzón 3D en `canvasRef` y alinea la ranura y la insignia HTML con las propiedades
 * `--ranura-*` e `--insignia-*` del contenedor. `failed` significa que no hay WebGL: se usa el dibujo plano.
 */
export function useMailbox3D(canvasRef: RefObject<HTMLCanvasElement | null>, input: Mailbox3DInput): Mailbox3DStatus {
	const editor = useEditor()
	const zoom = useValue('buzón zoom', () => editor.getZoomLevel(), [editor])
	const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio * zoom * input.scale))
	const [status, setStatus] = useState<Mailbox3DStatus>('loading')
	const scene = useRef<MailboxScene | null>(null)
	const redraw = useRef(() => {})
	const latest = useRef({ ...input, pixelRatio })
	latest.current = { ...input, pixelRatio }

	useEffect(() => {
		const canvas = canvasRef.current
		const container = canvas?.parentElement
		if (!canvas || !container) return
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
		let cancelled = false, visible = true, frame = 0, lastDraw = 0, busy = false
		const placed = new Map<string, number>()
		const place = (property: string, value: number) => {
			if (Math.abs((placed.get(property) ?? NaN) - value) < 0.5) return
			placed.set(property, value)
			container.style.setProperty(property, `${value.toFixed(1)}px`)
		}
		const age = (at: number | null, now: number) => at === null ? null : (now - at) / 1000
		const draw = (now: number) => {
			if (!scene.current) return
			lastDraw = now
			const { full, arrivalAt, drawAt, landingAt } = latest.current
			const result = scene.current.render(now / 1000, { full, arrival: age(arrivalAt, now), draw: age(drawAt, now), landing: age(landingAt, now) }, reduced.matches)
			busy = result.busy
			const anchors: MailboxAnchors = result.anchors
			place('--ranura-x', anchors.slot.x); place('--ranura-y', anchors.slot.y); place('--ranura-w', anchors.slotWidth)
			place('--insignia-x', anchors.badge.x); place('--insignia-y', anchors.badge.y)
		}
		const loop = (now: number) => {
			// En reposo basta con 30 cuadros por segundo; una carta en movimiento usa todos.
			if (busy || now - lastDraw >= IDLE_FRAME_MS) draw(now)
			frame = requestAnimationFrame(loop)
		}
		const start = () => {
			cancelAnimationFrame(frame)
			if (!scene.current || !visible || document.hidden) return
			if (reduced.matches) draw(performance.now())
			else frame = requestAnimationFrame(loop)
		}
		redraw.current = () => { busy = true; start() }

		// three.js se descarga con la escena, solo en canvases que muestran un buzón.
		import('./mailboxScene')
			.then(({ createMailboxScene }) => {
				if (cancelled) return
				const { width, height, pixelRatio } = latest.current
				try { scene.current = createMailboxScene(canvas, width, height, pixelRatio) }
				catch { setStatus('failed'); return }
				setStatus('ready')
				start()
			})
			.catch(() => { if (!cancelled) setStatus('failed') })

		const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start() })
		observer.observe(container)
		const onContextLost = (event: Event) => {
			event.preventDefault()
			cancelAnimationFrame(frame)
			scene.current?.dispose()
			scene.current = null
			setStatus('failed')
		}
		canvas.addEventListener('webglcontextlost', onContextLost)
		document.addEventListener('visibilitychange', start)
		reduced.addEventListener('change', start)
		return () => {
			cancelled = true
			cancelAnimationFrame(frame)
			observer.disconnect()
			canvas.removeEventListener('webglcontextlost', onContextLost)
			document.removeEventListener('visibilitychange', start)
			reduced.removeEventListener('change', start)
			scene.current?.dispose()
			scene.current = null
			redraw.current = () => {}
		}
	}, [canvasRef])

	useEffect(() => {
		scene.current?.resize(input.width, input.height, pixelRatio)
		redraw.current()
	}, [input.width, input.height, pixelRatio, status])

	// Con movimiento reducido no hay bucle: cada cambio pide su propio cuadro.
	useEffect(() => { redraw.current() }, [input.full, input.arrivalAt, input.drawAt, input.landingAt])

	return status
}
