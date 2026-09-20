import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
	animate,
	motion,
	useMotionTemplate,
	useMotionValue,
	useMotionValueEvent,
	useSpring,
	useTransform,
	type MotionValue,
} from 'motion/react'
import type { PassSkin, StickerId } from '../../../shared/pass'
import { packs, skins } from './catalog'
import { StickerArt } from './StickerArt'
import { usePassReducedMotion } from './usePassReducedMotion'
import { PassArrow } from './PassArrow'
import type { PlayPassSound } from './PassAudio'

export function StickerEnvelope({
	skin,
	onOpen,
	onSound,
	onTear,
}: {
	skin: PassSkin
	onOpen: () => void
	onSound?: PlayPassSound
	onTear?: (active: boolean) => void
}) {
	const reduced = usePassReducedMotion(),
		busy = useRef(false),
		alive = useRef(true),
		art = skins.find((s) => s.id === skin)!
	const [pulling, setPulling] = useState(false),
		[opened, setOpened] = useState(false)
	const tracking = useRef<{
		id: number
		x: number
		width: number
		at: number
		lastX: number
		velocity: number
	} | null>(null)
	const x = useMotionValue(0),
		y = useMotionValue(0),
		tear = useMotionValue(0),
		reveal = useMotionValue(0),
		burst = useMotionValue(0),
		packWidth = useMotionValue(260)
	useMotionValueEvent(tear, 'change', (value) => {
		onTear?.(
			Boolean(tracking.current || busy.current) &&
				value < -1 &&
				value > -100 &&
				value < (tear.getPrevious() ?? 0),
		)
	})
	useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
			onTear?.(false)
			tear.stop()
			reveal.stop()
			burst.stop()
		}
	}, [tear, reveal, burst, onTear])
	const rx = useSpring(x, { stiffness: 240, damping: 28 }),
		ry = useSpring(y, { stiffness: 240, damping: 28 })
	const rotation = useMotionTemplate`rotateX(${rx}deg) rotateY(${ry}deg)`
	const shine = useTransform(ry, [-6, 6], [-28, 28]),
		light = useMotionTemplate`translateX(${shine}%)`
	const sealClip = useTransform(
		tear,
		(v) => `inset(0 ${Math.min(100, -v)}% 0 0)`,
	)
	const looseClip = useTransform(
		tear,
		(v) => `inset(0 0 0 ${Math.max(0, 87 + v)}%)`,
	)
	const looseTransform = useTransform(
		tear,
		(v) =>
			`translateX(${v * 0.8}%) translateY(${v * 0.12}px) rotate(${-v * 0.13}deg)`,
	)
	const handleX = useTransform(
		[tear, packWidth],
		([v, w]) => (Number(v) / 100) * Number(w),
	)
	const handleTransform = useMotionTemplate`translateX(${handleX}px)`
	const packDrop = useTransform(
		reveal,
		(v) => `translateY(${reduced ? 0 : v * 32}px)`,
	)
	async function open(velocity = 0, keyboard = false) {
		if (busy.current) return
		busy.current = true
		setPulling(true)
		if (reduced) {
			onTear?.(false)
			if (keyboard) onSound?.('rip')
			tear.set(-110)
		}
		else
			await animate(tear, -110, {
				type: 'spring',
				stiffness: 260,
				damping: 28,
				velocity,
			})
		if (!alive.current) return
		onTear?.(false)
		setOpened(true)
		onSound?.('reveal')
		if (!reduced) void animate(burst, 1, { duration: 1.15, ease: 'linear' })
		await animate(reveal, 1, {
			duration: reduced ? 0.16 : 0.6,
			ease: [0.19, 1, 0.22, 1],
		})
		await new Promise((resolve) => setTimeout(resolve, reduced ? 240 : 1000))
		if (alive.current) onOpen()
	}
	function move(e: PointerEvent<HTMLButtonElement>) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		t.velocity =
			((((e.clientX - t.lastX) / Math.max(8, e.timeStamp - t.at)) * 1000) /
				t.width) *
			100
		t.lastX = e.clientX
		t.at = e.timeStamp
		tear.set(Math.max(-100, Math.min(0, ((e.clientX - t.x) / t.width) * 100)))
	}
	function end(e: PointerEvent<HTMLButtonElement>, cancel = false) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		tracking.current = null
		const v = e.timeStamp - t.at > 100 ? 0 : t.velocity
		if (!cancel && (tear.get() < -56 || (tear.get() < -12 && v < -230)))
			void open(v)
		else {
			onTear?.(false)
			setPulling(false)
			if (reduced) tear.set(0)
			else
				void animate(tear, 0, {
					type: 'spring',
					stiffness: 420,
					damping: 30,
					velocity: v,
				})
		}
	}
	return (
		<div className="pass-envelope-wrap" data-skin={skin}>
			<div
				className="pass-envelope-space"
				onPointerMove={(e) => {
					if (reduced || pulling || e.pointerType !== 'mouse') return
					const r = e.currentTarget.getBoundingClientRect()
					x.set(-((e.clientY - r.top) / r.height - 0.5) * 10)
					y.set(((e.clientX - r.left) / r.width - 0.5) * 12)
				}}
				onPointerLeave={() => {
					x.set(0)
					y.set(0)
				}}
			>
				<motion.div
					className="pass-envelope"
					style={{ transform: reduced || pulling ? 'none' : rotation }}
				>
					{packs[skin].slice(0, 6).map((id, i) => (
						<EmergingSticker
							key={id}
							art={id}
							index={i}
							progress={reveal}
							reduced={reduced}
						/>
					))}
					{opened &&
						!reduced &&
						Array.from({ length: 18 }, (_, i) => (
							<PackSpark key={i} index={i} progress={burst} />
						))}
					<motion.div
						className="pass-pack-shell"
						style={{ transform: packDrop }}
					>
						<div className="pass-envelope-pocket">
							{art.image && (
								<img
									className="pass-pack-art"
									src={art.image}
									alt=""
									draggable={false}
								/>
							)}
							<div className="pass-pack-hologram" />
							<motion.div
								className="pass-envelope-shine"
								style={{ transform: reduced || pulling ? 'none' : light }}
							/>
						</div>
						<div className="pass-pack-mouth" data-open={opened} />
						<motion.div
							className="pass-pack-seal"
							style={{ clipPath: sealClip }}
						/>
						<motion.div
							className="pass-pack-loose"
							style={{
								clipPath: looseClip,
								transform: looseTransform,
								opacity: opened ? 0 : 1,
							}}
						/>
						<motion.button
							className="pass-pack-tab"
							data-pulling={pulling}
							style={{ transform: handleTransform, opacity: opened ? 0 : 1 }}
							disabled={opened}
							aria-label="Rasgar el sobre hacia la izquierda"
							onPointerDown={(e) => {
								if (e.button !== 0 || busy.current || tracking.current) return
								e.preventDefault()
								tear.stop()
								setPulling(true)
								packWidth.set(e.currentTarget.parentElement!.clientWidth)
								tracking.current = {
									id: e.pointerId,
									x:
										e.clientX -
										(tear.get() / 100) *
											e.currentTarget.parentElement!.clientWidth,
									width: e.currentTarget.parentElement!.clientWidth,
									at: e.timeStamp,
									lastX: e.clientX,
									velocity: 0,
								}
								e.currentTarget.setPointerCapture(e.pointerId)
							}}
							onPointerMove={move}
							onPointerUp={end}
							onPointerCancel={(e) => end(e, true)}
							onLostPointerCapture={(e) => end(e, true)}
							onClick={(e) => {
								if (e.detail === 0) void open(0, true)
							}}
						>
							<span className="pass-pack-grip">
								<PassArrow direction="left" className="pass-pack-arrow" />
							</span>
						</motion.button>
					</motion.div>
				</motion.div>
			</div>
			<p className="pass-sr-only">
				Desliza la esquina hacia la izquierda. Con teclado, pulsa Enter sobre la
				flecha.
			</p>
		</div>
	)
}

function PackSpark({
	index,
	progress,
}: {
	index: number
	progress: MotionValue<number>
}) {
	const transform = useTransform(progress, (v) => {
		const x = (index - 8.5) * 20 * v,
			y = -(190 + (index % 4) * 24) * v + 115 * v * v
		return `translate(${x}px, ${y}px) rotate(${(index % 2 ? 1 : -1) * v * 130}deg)`
	})
	const opacity = useTransform(progress, [0, 0.1, 0.65, 1], [0, 1, 0.9, 0])
	return (
		<motion.svg
			className="pass-pack-confetti"
			viewBox="0 0 16 16"
			style={{
				transform,
				opacity,
				color: ['#f6eab6', '#fbb9cf', '#b8e9dd', '#c7c5fa'][index % 4],
			}}
			aria-hidden="true"
		>
			{index % 3 === 0 ? (
				<path d="m8 0 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="currentColor" />
			) : (
				<rect x="5" y="3" width="6" height="10" rx="1" fill="currentColor" />
			)}
		</motion.svg>
	)
}

function EmergingSticker({
	art,
	index,
	progress,
	reduced,
}: {
	art: StickerId
	index: number
	progress: MotionValue<number>
	reduced: boolean
}) {
	const transform = useTransform(
		progress,
		(v) =>
			`translate(${reduced ? 0 : (index - 2.5) * 32 * v}px, ${reduced ? -95 : -v * (160 + (index % 2) * 40)}px) rotate(${reduced ? 0 : (index - 2.5) * 13 * v}deg)`,
	)
	const opacity = useTransform(progress, [0, 0.08, 0.7, 1], [0, 1, 1, 1])
	return (
		<motion.div
			className="pass-emerging-sticker"
			style={{ transform, opacity }}
		>
			<StickerArt art={art} />
		</motion.div>
	)
}
