import { useEffect, useRef, useState, type RefObject } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { MachineAnchors, MachineScene } from './machineScene'

const IDLE_FRAME_MS = 1000 / 30

export type Machine3DInput = {
	/** Server timestamp of the current spin, shared by every viewer. */
	spinStartedAt: number | null
	/** When this viewer inserted a coin, or null. */
	coinAt: number | null
	cost: number
	prizeColor: string
	width: number
	height: number
}
export type Machine3DStatus = 'loading' | 'ready' | 'failed'

/**
 * Renders the 3D machine into `canvasRef` and keeps the HTML controls aligned with it through the
 * `--lever-*`, `--coin-*` and `--slot-*` properties of the canvas' parent.
 * `failed` means WebGL or the module is unavailable, so the CSS machine should be shown instead.
 */
export function useMachine3D(canvasRef: RefObject<HTMLCanvasElement | null>, input: Machine3DInput): Machine3DStatus {
	const editor = useEditor()
	const zoom = useValue('gachapon zoom', () => editor.getZoomLevel(), [editor])
	const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio * zoom))
	const [status, setStatus] = useState<Machine3DStatus>('loading')
	const scene = useRef<MachineScene | null>(null)
	const redraw = useRef(() => {})
	const latest = useRef({ ...input, pixelRatio })
	latest.current = { ...input, pixelRatio }

	useEffect(() => {
		const canvas = canvasRef.current
		const container = canvas?.parentElement
		if (!canvas || !container) return
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
		let cancelled = false, visible = true, frame = 0, lastDraw = 0
		const placed = new Map<string, number>()
		const place = (anchors: MachineAnchors) => {
			for (const [name, point] of Object.entries(anchors)) for (const axis of ['x', 'y'] as const) {
				const property = `--${name}-${axis}`, value = point[axis]
				if (Math.abs((placed.get(property) ?? NaN) - value) < 0.5) continue
				placed.set(property, value)
				container.style.setProperty(property, `${value.toFixed(1)}px`)
			}
		}
		const draw = (now: number) => {
			if (!scene.current) return
			lastDraw = now
			const { spinStartedAt, coinAt, prizeColor } = latest.current
			place(scene.current.render(now / 1000, {
				spinAge: spinStartedAt === null ? null : (Date.now() - spinStartedAt) / 1000,
				coinAge: coinAt === null ? null : (Date.now() - coinAt) / 1000,
				prizeColor,
			}, reduced.matches))
		}
		const busy = () => latest.current.spinStartedAt !== null || latest.current.coinAt !== null
		const loop = (now: number) => {
			// Idle sway does not need every display frame; a spin or a coin does.
			if (busy() || now - lastDraw >= IDLE_FRAME_MS) draw(now)
			frame = requestAnimationFrame(loop)
		}
		const start = () => {
			cancelAnimationFrame(frame)
			if (!scene.current || !visible || document.hidden) return
			if (reduced.matches) draw(performance.now())
			else frame = requestAnimationFrame(loop)
		}
		redraw.current = start

		// three.js loads with the scene module, only for boards that show a machine.
		import('./machineScene')
			.then(({ createMachineScene }) => {
				if (cancelled) return
				const { width, height, pixelRatio, cost } = latest.current
				try { scene.current = createMachineScene(canvas, width, height, pixelRatio) }
				catch { setStatus('failed'); return }
				scene.current.setCost(cost)
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
	}, [input.width, input.height, pixelRatio])

	useEffect(() => {
		scene.current?.setCost(input.cost)
		redraw.current()
	}, [input.cost, status])

	// Under reduced motion there is no loop, so state changes need their own frame.
	useEffect(() => { redraw.current() }, [input.spinStartedAt, input.coinAt, input.prizeColor])

	return status
}
