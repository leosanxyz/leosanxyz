import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { buildFxProgram, draw, release } from '../portal/pass/materials/gl'
import { useHeroSlot } from '../portal/pass/materials/heroSlot'
import { usePassReducedMotion } from '../portal/pass/usePassReducedMotion'
import { fxSheet, fxUniforms, type FxSheet } from './fx/bake'
import type { FxSpec } from './fx/specs'

/** Where the effect's box sits inside its spill area, as percentages of the box. */
const spillStyle = (spec: FxSpec): CSSProperties => ({
	left: `${-spec.pad[0] / spec.box[0] * 100}%`, top: `${-spec.pad[1] / spec.box[1] * 100}%`,
	width: `${(spec.box[0] + 2 * spec.pad[0]) / spec.box[0] * 100}%`, height: `${(spec.box[1] + 2 * spec.pad[1]) / spec.box[1] * 100}%`,
})

/**
 * A shader effect around a box: baked once into a sprite sheet and played with CSS `steps()`, so a list of 14 runs no WebGL.
 * With `live`, the one hero of its kind on screen draws the shader every frame instead and reacts to the pointer over `root`.
 */
export function Fx({ id, spec, live = false, root, slot }: { id: string; spec: FxSpec; live?: boolean; root?: RefObject<HTMLElement | null>; slot: string }) {
	const host = useRef<HTMLSpanElement>(null)
	const [seen, setSeen] = useState(false), [sheet, setSheet] = useState<FxSheet | null>(null), [failed, setFailed] = useState(false)
	const [delay] = useState(() => -Math.random() * 5)
	const reduced = usePassReducedMotion()
	const supported = typeof WebGL2RenderingContext !== 'undefined'
	const owner = useHeroSlot(host, live && supported && !failed && !reduced, slot)
	useEffect(() => {
		const element = host.current
		if (!element || seen) return
		const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setSeen(true) }, { rootMargin: '200px' })
		observer.observe(element)
		return () => observer.disconnect()
	}, [seen])
	useEffect(() => {
		if (!seen || !supported) return
		let current = true
		fxSheet(id, spec).then((next) => { if (current) setSheet(next) }).catch((cause) => console.error(cause))
		return () => { current = false }
	}, [seen, supported, id, spec])
	return <span ref={host} className="cosmetic-fx" data-ready={Boolean(sheet) || owner} aria-hidden="true" style={spillStyle(spec)}>
		{owner ? <LiveFx key={id} spec={spec} root={root ?? host} onFail={() => setFailed(true)} />
			: sheet && <span className="cosmetic-fx__strip" style={{ backgroundImage: `url(${sheet.url})`, ['--n' as string]: sheet.frames, ['--loop' as string]: `${sheet.loop}s`, animationDelay: `${(delay % sheet.loop).toFixed(2)}s` }} />}
	</span>
}

function LiveFx({ spec, root, onFail }: { spec: FxSpec; root: RefObject<HTMLElement | null>; onFail: () => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null), fail = useRef(onFail)
	fail.current = onFail
	useEffect(() => {
		const canvas = canvasRef.current, box = root.current
		if (!canvas || !box) return
		const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
		if (!gl) { fail.current(); return }
		let program: ReturnType<typeof buildFxProgram>
		try { program = buildFxProgram(gl, spec.fs) } catch (cause) { console.error(cause); fail.current(); return }
		let frame = 0, stopped = false, last = 0, t = Math.random() * spec.loop, clock = 0
		const pointer = { x: -5, y: -5, inside: false, hover: 0, speed: 0, lastX: 0, lastY: 0, lastT: 0 }
		const move = (event: PointerEvent) => {
			const r = box.getBoundingClientRect()
			const x = (event.clientX - r.left) / r.width, y = 1 - (event.clientY - r.top) / r.height, now = event.timeStamp / 1000
			if (pointer.inside && now > pointer.lastT) pointer.speed = Math.min(1, Math.max(pointer.speed, Math.hypot(x - pointer.lastX, y - pointer.lastY) / Math.max(1 / 240, now - pointer.lastT) / 3))
			Object.assign(pointer, { x, y, inside: true, lastX: x, lastY: y, lastT: now })
		}
		const leave = () => { pointer.inside = false }
		box.addEventListener('pointermove', move)
		box.addEventListener('pointerleave', leave)
		const lost = (event: Event) => { event.preventDefault(); stopped = true }
		canvas.addEventListener('webglcontextlost', lost)
		const resize = () => {
			const dpr = Math.min(2, devicePixelRatio || 1), r = canvas.getBoundingClientRect()
			canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr))
		}
		const observer = new ResizeObserver(resize)
		observer.observe(canvas)
		resize()
		const loop = (now: number) => {
			if (stopped) return
			const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
			last = now
			pointer.hover += ((pointer.inside ? 1 : 0) - pointer.hover) * (1 - Math.exp(-dt * 6))
			pointer.speed *= Math.exp(-dt * 3)
			// a fast pointer stirs the effect: time runs a little quicker under it
			t += dt * (1 + pointer.speed * 1.5); clock += dt
			const a = clock * 0.5
			draw(gl, program, fxUniforms(spec, [canvas.width, canvas.height], t, {
				uClock: clock, uHover: pointer.hover, uSpeed: pointer.speed, uDpr: Math.min(2, devicePixelRatio || 1),
				uPtr: pointer.inside ? [pointer.x, pointer.y] : [-5, -5], uLamp: pointer.inside ? [pointer.x, pointer.y] : [0.5 + 0.35 * Math.cos(a), 0.6 + 0.3 * Math.sin(a)],
			}))
			frame = requestAnimationFrame(loop)
		}
		frame = requestAnimationFrame(loop)
		return () => {
			stopped = true
			cancelAnimationFrame(frame)
			observer.disconnect()
			box.removeEventListener('pointermove', move)
			box.removeEventListener('pointerleave', leave)
			canvas.removeEventListener('webglcontextlost', lost)
			release(gl)
		}
	}, [spec, root])
	return <canvas ref={canvasRef} className="cosmetic-fx__live" />
}
