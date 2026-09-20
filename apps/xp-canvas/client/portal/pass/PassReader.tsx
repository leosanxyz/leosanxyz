import {
	useEffect,
	useRef,
	useState,
	type PointerEvent,
	type ReactNode,
	type RefObject,
	type HTMLAttributes,
} from 'react'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { PassArrow } from './PassArrow'
import { clamp } from './stickerGeometry'
import { usePassReducedMotion } from './usePassReducedMotion'
import type { PlayPassSound } from './PassAudio'

export interface ReaderCard {
	active: boolean
	ref: RefObject<HTMLDivElement | null>
	style: { y: MotionValue<number>; opacity: MotionValue<number> }
	props: HTMLAttributes<HTMLDivElement>
}

export function PassReader({
	active,
	children,
	onInsert,
	onBusy,
	onSound,
}: {
	active: boolean
	children: (card: ReaderCard) => ReactNode
	onInsert: (onSaved: () => Promise<void>) => Promise<boolean>
	onBusy: (busy: boolean) => void
	onSound?: PlayPassSound
}) {
	const reduced = usePassReducedMotion(),
		windowRef = useRef<HTMLDivElement>(null),
		card = useRef<HTMLDivElement>(null)
	const y = useMotionValue(0),
		opacity = useMotionValue(1)
	const [busy, setBusy] = useState(false),
		[holding, setHolding] = useState(false),
		[inserted, setInserted] = useState(false)
	const alive = useRef(true),
		locked = useRef(false),
		stop = useRef(220),
		pressDepth = useRef(18)
	const tracking = useRef<{
		id: number
		from: number
		base: number
		last: number
		at: number
		velocity: number
	} | null>(null)
	useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
		}
	}, [])
	useEffect(() => {
		if (!active) {
			tracking.current = null
			setHolding(false)
			if (reduced) y.jump(0)
			else void animate(y, 0, { duration: 0.16, ease: [0.22, 1, 0.36, 1] })
			return
		}
		const resize = () => {
			if (!windowRef.current || !card.current) return
			stop.current =
				windowRef.current.clientHeight - card.current.offsetHeight / 2
			pressDepth.current = clamp(card.current.offsetHeight * 0.06, 16, 22)
			if (locked.current) y.jump(stop.current)
		}
		resize()
		const observer = new ResizeObserver(resize)
		observer.observe(windowRef.current!)
		return () => {
			observer.disconnect()
			y.stop()
			opacity.stop()
		}
	}, [active, reduced, y, opacity])
	useEffect(() => {
		if (!active || reduced || busy || holding || inserted) return
		const hint = animate(y, [0, 6, 0], {
			duration: 1.7,
			delay: 1.1,
			repeat: Infinity,
			repeatDelay: 1.5,
			ease: [0.65, 0, 0.35, 1],
		})
		return () => hint.stop()
	}, [active, reduced, busy, holding, inserted, y])
	async function insert(velocity = 0) {
		if (!active || locked.current) return
		locked.current = true
		onSound?.('card')
		setBusy(true)
		onBusy(true)
		y.stop()
		const remaining = stop.current - y.get()
		if (reduced) y.jump(stop.current)
		else if (Math.abs(remaining) > 0.2)
			await animate(y, stop.current, {
				type: 'spring',
				stiffness: remaining < 0 ? 320 : 240,
				damping: remaining < 0 ? 24 : 36,
				// At the physical stop there is no remaining downward velocity.
				velocity:
					remaining < 0
						? clamp(velocity, remaining * 12, 0)
						: clamp(velocity, 0, remaining * 12),
			})
		if (!alive.current) return
		setInserted(true)
		// Let the half-inserted pass read before opening the classroom.
		await new Promise((resolve) => setTimeout(resolve, reduced ? 160 : 560))
		if (!alive.current) return
		const accepted = await onInsert(async () => {
			await animate(opacity, 0, { duration: 0.18 })
		})
		if (!alive.current) return
		if (!accepted) {
			locked.current = false
			setBusy(false)
			onBusy(false)
			opacity.set(1)
		}
	}
	function start(e: PointerEvent<HTMLDivElement>) {
		if (e.button !== 0 || locked.current || tracking.current) return
		e.preventDefault()
		y.stop()
		setHolding(true)
		tracking.current = {
			id: e.pointerId,
			from: e.clientY,
			base: y.get(),
			last: e.clientY,
			at: e.timeStamp,
			velocity: 0,
		}
		e.currentTarget.setPointerCapture(e.pointerId)
	}
	function move(e: PointerEvent<HTMLDivElement>) {
		const t = tracking.current
		if (!t || e.pointerId !== t.id) return
		const dy = e.clientY - t.from
		t.velocity = ((e.clientY - t.last) / Math.max(8, e.timeStamp - t.at)) * 1000
		t.last = e.clientY
		t.at = e.timeStamp
		// A pressed card goes slightly past its resting, half-inserted position.
		y.set(clamp(t.base + dy, 0, stop.current + pressDepth.current))
	}
	function end(e: PointerEvent<HTMLDivElement>, cancel = false) {
		const t = tracking.current
		if (!t || e.pointerId !== t.id) return
		tracking.current = null
		const velocity = e.timeStamp - t.at > 100 ? 0 : t.velocity
		const travelled = e.clientY - t.from
		if (
			!cancel &&
			(y.get() > stop.current * 0.42 || (travelled > 20 && velocity > 450))
		) {
			setHolding(false)
			void insert(velocity)
		} else {
			const reset = reduced
				? Promise.resolve(y.jump(0))
				: animate(y, 0, {
						type: 'spring',
						stiffness: 340,
						damping: 35,
						velocity,
					})
			void Promise.resolve(reset).then(() => {
				if (alive.current) setHolding(false)
			})
		}
	}
	return (
		<div
			className="pass-reader-scene"
			data-active={active}
			data-busy={busy}
			data-holding={holding}
			data-inserted={inserted}
		>
			<motion.svg
				className="pass-reader-slot"
				viewBox="0 0 600 18"
				preserveAspectRatio="none"
				aria-hidden="true"
				initial={false}
				animate={{ opacity: active ? 1 : 0 }}
				transition={{ type: 'tween', duration: 0.18, delay: active ? 0.12 : 0 }}
			>
				<path
					d="M6 15 40 7 Q50 4 66 4H534Q550 4 560 7L594 15Z"
					fill="#242321"
					stroke="#bcb8b2"
					strokeWidth="1.7"
				/>
			</motion.svg>
			<motion.div
				initial={false}
				animate={{ opacity: active && !inserted ? 1 : 0 }}
				transition={{ type: 'tween', duration: 0.18 }}
				aria-hidden="true"
			>
				<PassArrow direction="down" className="pass-reader-chevron" />
			</motion.div>
			<div
				ref={windowRef}
				className="pass-reader-window"
				data-testid="pass-reader-window"
			>
				{children({
					active,
					ref: card,
					style: { y, opacity },
					props: active
						? {
								role: 'button',
								tabIndex: 0,
								'aria-label': 'Insertar pase y entrar a mis clases',
								'aria-disabled': busy,
								'aria-description':
									'Arrastra la tarjeta hacia abajo. Con teclado, pulsa Enter o Espacio.',
								onPointerDown: start,
								onPointerMove: move,
								onPointerUp: end,
								onPointerCancel: (e) => end(e, true),
								onLostPointerCapture: (e) => {
									if (e.target === e.currentTarget) end(e, true)
								},
								onClick: (e) => {
									if (e.detail === 0 && !busy) void insert()
								},
								onKeyDown: (e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault()
										void insert()
									}
								},
							}
						: {},
				})}
			</div>
			<motion.div
				className="pass-reader-lip"
				aria-hidden="true"
				initial={false}
				animate={{ opacity: active ? 1 : 0 }}
				transition={{ type: 'tween', duration: 0.18, delay: active ? 0.12 : 0 }}
			/>
		</div>
	)
}
