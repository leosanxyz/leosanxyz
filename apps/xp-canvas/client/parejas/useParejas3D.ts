import { useEffect, useRef, useState, type RefObject } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { ParejasBalls, ParejasScene } from './parejasScene'

const IDLE_FRAME_MS = 1000 / 30

export type Parejas3DInput = {
	width: number
	height: number
	/** Escala de la figura en el canvas; junto con el zoom decide la nitidez. */
	scale: number
	/** Inicio local del último sorteo, en `performance.now()`, o null. */
	start: number | null
	balls: ParejasBalls
}
export type Parejas3DStatus = 'loading' | 'ready' | 'failed'

/**
 * Dibuja la tómbola 3D en `canvasRef` y alinea las etiquetas HTML con la bandeja mediante
 * `--bandeja-x` y `--bandeja-y` del contenedor. `failed` significa que no hay WebGL: se usa el dibujo plano.
 */
export function useParejas3D(canvasRef: RefObject<HTMLCanvasElement | null>, input: Parejas3DInput): Parejas3DStatus {
	const editor = useEditor()
	const zoom = useValue('parejas zoom', () => editor.getZoomLevel(), [editor])
	const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio * zoom * input.scale))
	const [status, setStatus] = useState<Parejas3DStatus>('loading')
	const scene = useRef<ParejasScene | null>(null)
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
		const draw = (now: number) => {
			if (!scene.current) return
			lastDraw = now
			const { start } = latest.current
			const result = scene.current.render(now / 1000, start === null ? Infinity : (now - start) / 1000, reduced.matches)
			busy = result.busy
			place('--bandeja-x', result.tray.x); place('--bandeja-y', result.tray.y)
		}
		const loop = (now: number) => {
			// En reposo el tambor apenas se mece: bastan 30 cuadros por segundo. Un sorteo usa todos.
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

		// three.js se descarga con la escena, solo en canvases que muestran una tómbola.
		import('./parejasScene')
			.then(({ createParejasScene }) => {
				if (cancelled) return
				const { width, height, pixelRatio, balls } = latest.current
				try { scene.current = createParejasScene(canvas, width, height, pixelRatio) }
				catch { setStatus('failed'); return }
				scene.current.setBalls(balls)
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

	// Las bolas cambian cuando cambian los participantes o las parejas, no en cada render.
	const ballsKey = JSON.stringify(input.balls)
	useEffect(() => {
		scene.current?.setBalls(latest.current.balls)
		redraw.current()
	}, [ballsKey, input.start, status])

	return status
}
