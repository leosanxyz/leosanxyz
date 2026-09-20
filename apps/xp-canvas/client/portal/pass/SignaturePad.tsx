import { useRef, type PointerEvent } from 'react'
import {
	MAX_SIGNATURE_POINTS,
	MAX_SIGNATURE_STROKES,
	type PassSignature,
	type SignaturePoint,
} from '../../../shared/pass'

const signaturePath = (points: SignaturePoint[]) =>
	points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')

export function SignatureInk({
	signature,
}: {
	signature?: PassSignature | null
}) {
	return signature?.kind === 'typed' ? (
		<text
			className="pass-typed-signature"
			x="300"
			y="195"
			textAnchor="middle"
			textLength={signature.name.length > 14 ? 520 : undefined}
			lengthAdjust="spacingAndGlyphs"
		>
			{signature.name}
		</text>
	) : signature?.kind === 'drawn' ? (
		signature.strokes.map((points, i) => (
			<path key={i} d={signaturePath(points)} />
		))
	) : null
}

export function SignaturePad({
	signature,
	onChange,
}: {
	signature?: PassSignature | null
	onChange: (signature: PassSignature) => void
}) {
	const ink = useRef<SVGPathElement>(null)
	const pen = useRef<SVGCircleElement>(null)
	const keyboard = useRef<{
		point: SignaturePoint
		points: SignaturePoint[]
		down: boolean
	}>({ point: [220, 170], points: [], down: false })
	const tracking = useRef<{
		id: number
		points: SignaturePoint[]
		rect: DOMRect
	} | null>(null)
	const strokes = signature?.kind === 'drawn' ? signature.strokes : []
	function point(e: PointerEvent<SVGSVGElement>): SignaturePoint {
		const r = tracking.current!.rect
		return [
			Math.round(
				Math.max(0, Math.min(600, ((e.clientX - r.left) / r.width) * 600)),
			),
			Math.round(
				Math.max(0, Math.min(340, ((e.clientY - r.top) / r.height) * 340)),
			),
		]
	}
	function start(e: PointerEvent<SVGSVGElement>) {
		if (
			e.button !== 0 ||
			tracking.current ||
			strokes.length >= MAX_SIGNATURE_STROKES
		)
			return
		e.preventDefault()
		e.stopPropagation()
		tracking.current = {
			id: e.pointerId,
			points: [],
			rect: e.currentTarget.getBoundingClientRect(),
		}
		tracking.current.points.push(point(e))
		e.currentTarget.setPointerCapture(e.pointerId)
		ink.current?.setAttribute('d', '')
	}
	function move(e: PointerEvent<SVGSVGElement>) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		const p = point(e),
			last = t.points[t.points.length - 1]
		if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return
		t.points.push(p)
		// Bound live work too. Decimation preserves the whole gesture, not just its beginning.
		if (t.points.length > MAX_SIGNATURE_POINTS)
			t.points = t.points.filter(
				(_, i) => i % 2 === 0 || i === t.points.length - 1,
			)
		ink.current?.setAttribute('d', signaturePath(t.points))
	}
	function end(e: PointerEvent<SVGSVGElement>, cancel = false) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		tracking.current = null
		ink.current?.setAttribute('d', '')
		if (cancel || t.points.length < 2) return
		const all = [...strokes, t.points]
		while (all.reduce((n, s) => n + s.length, 0) > MAX_SIGNATURE_POINTS) {
			const longest = all.reduce(
				(a, s, i) => (s.length > all[a].length ? i : a),
				0,
			)
			all[longest] = all[longest].filter(
				(_, i, s) => i % 2 === 0 || i === s.length - 1,
			)
		}
		onChange({ kind: 'drawn', strokes: all })
	}
	return (
		<svg
			className="pass-signature-pad"
			viewBox="0 0 600 340"
			aria-label="Dibuja tu firma con el cursor o el dedo"
			role="application"
			tabIndex={0}
			aria-description="Con teclado, usa las flechas para mover el lápiz y Espacio para comenzar o terminar un trazo. Escape lo cancela."
			onPointerDown={start}
			onPointerMove={move}
			onPointerUp={end}
			onPointerCancel={(e) => end(e, true)}
			onLostPointerCapture={(e) => end(e, true)}
			onFocus={() => pen.current?.setAttribute('opacity', '1')}
			onBlur={() => {
				pen.current?.setAttribute('opacity', '0')
				keyboard.current.down = false
				keyboard.current.points = []
				if (!tracking.current) ink.current?.setAttribute('d', '')
			}}
			onKeyDown={(e) => {
				const k = keyboard.current
				if (e.key === 'Escape') {
					e.preventDefault()
					k.down = false
					k.points = []
					ink.current?.setAttribute('d', '')
					return
				}
				if (e.key === ' ' || e.key === 'Enter') {
					e.preventDefault()
					if (
						k.down &&
						k.points.length >= 2 &&
						strokes.length < MAX_SIGNATURE_STROKES
					) {
						const left =
							MAX_SIGNATURE_POINTS - strokes.reduce((n, s) => n + s.length, 0)
						if (left >= 2)
							onChange({
								kind: 'drawn',
								strokes: [...strokes, k.points.slice(0, left)],
							})
					}
					k.down = !k.down
					k.points = k.down ? [[...k.point]] : []
					ink.current?.setAttribute('d', '')
					return
				}
				const delta = (
					{
						ArrowLeft: [-1, 0],
						ArrowRight: [1, 0],
						ArrowUp: [0, -1],
						ArrowDown: [0, 1],
					} as Record<string, number[]>
				)[e.key]
				if (!delta) return
				e.preventDefault()
				const step = e.shiftKey ? 30 : 12
				k.point = [
					Math.max(0, Math.min(600, k.point[0] + delta[0] * step)),
					Math.max(0, Math.min(340, k.point[1] + delta[1] * step)),
				]
				pen.current?.setAttribute('cx', String(k.point[0]))
				pen.current?.setAttribute('cy', String(k.point[1]))
				if (k.down && k.points.length < MAX_SIGNATURE_POINTS) {
					k.points.push([...k.point])
					ink.current?.setAttribute('d', signaturePath(k.points))
				}
			}}
		>
			<SignatureInk signature={signature} />
			<path ref={ink} />
			<circle
				ref={pen}
				cx="220"
				cy="170"
				r="9"
				fill="none"
				strokeWidth="2"
				opacity="0"
			/>
		</svg>
	)
}
