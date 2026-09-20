import {
	useEffect,
	useRef,
	useState,
	type PointerEvent,
	type ComponentProps,
} from 'react'
import {
	animate,
	AnimatePresence,
	motion,
	useMotionValue,
	useTransform,
	type MotionValue,
} from 'motion/react'
import { passStickers, type PassDraft, type PassSkin } from '../../../shared/pass'
import { carouselOffset, nearestCard, wrapCard } from './carouselPosition'
import { PassCard } from './PassCard'
import { skins } from './catalog'
import { clamp } from './stickerGeometry'
import { usePassReducedMotion } from './usePassReducedMotion'
import type { ReaderCard } from './PassReader'
import type { StickerCard } from './StickerEditor'

type Identity = Pick<
	ComponentProps<typeof PassCard>,
	'back' | 'naming' | 'onName' | 'onNameDone' | 'onSignature' | 'signing'
> & { onErase: () => void }

export function PassCarousel({
	draft,
	phase,
	onSelect,
	design = true,
	identity,
	reader,
	stickerCard,
	mode,
	cardControls,
	align = 'center',
}: {
	draft: PassDraft
	phase: MotionValue<number>
	onSelect: (skin: PassSkin) => void
	design?: boolean
	identity?: Identity
	reader?: ReaderCard
	stickerCard?: StickerCard
	mode: 'identity' | 'design' | 'stickers' | 'celebration' | 'reader'
	cardControls?: Pick<ComponentProps<typeof PassCard>, 'back' | 'actions'>
	align?: 'center' | 'start'
}) {
	const index = skins.findIndex((s) => s.id === draft.skin),
		reduced = usePassReducedMotion()
	const position = useMotionValue(index),
		probe = useRef<HTMLDivElement>(null)
	const [width, setWidth] = useState(260),
		[dragging, setDragging] = useState(false)
	const track = useRef<{
		id: number
		x: number
		start: number
		lastX: number
		at: number
		velocity: number
	} | null>(null)
	const moved = useRef(false),
		velocity = useRef(0),
		keyboard = useRef(false)
	useEffect(() => {
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		)
		if (probe.current) observer.observe(probe.current)
		return () => observer.disconnect()
	}, [])
	useEffect(() => {
		const target = align === 'start' ? nearestCard(index, position.get(), skins.length) : index
		if (reduced || keyboard.current) {
			position.jump(target)
			keyboard.current = false
			return
		}
		const animation = animate(position, target, {
			type: 'spring',
			stiffness: 220,
			damping: 29,
			velocity: velocity.current,
		})
		velocity.current = 0
		return () => animation.stop()
	}, [index, position, reduced, align])
	function start(e: PointerEvent<HTMLDivElement>) {
		if (!design || e.button !== 0 || track.current) return
		if ((e.target as Element).closest('button, input, textarea, .pass-sticker, [role="slider"]')) return
		position.stop()
		moved.current = false
		track.current = {
			id: e.pointerId,
			x: e.clientX,
			start: position.get(),
			lastX: e.clientX,
			at: e.timeStamp,
			velocity: 0,
		}
		// Capture only once moving: a plain click must still reach a card.
	}
	function move(e: PointerEvent<HTMLDivElement>) {
		const t = track.current
		if (!t || t.id !== e.pointerId) return
		const dx = e.clientX - t.x
		if (!moved.current && Math.abs(dx) < 5) return
		if (!moved.current) {
			moved.current = true
			setDragging(true)
			e.currentTarget.setPointerCapture(e.pointerId)
		}
		t.velocity =
			((-(e.clientX - t.lastX) / Math.max(8, e.timeStamp - t.at)) * 1000) /
			(width + 28)
		t.lastX = e.clientX
		t.at = e.timeStamp
		const next = t.start - dx / (width + 28)
		position.set(align === 'start' ? next : clamp(next, -0.16, skins.length - 0.84))
	}
	function end(e: PointerEvent<HTMLDivElement>, cancel = false) {
		const t = track.current
		if (!t || t.id !== e.pointerId) return
		track.current = null
		setDragging(false)
		if (!moved.current) return
		const v = e.timeStamp - t.at > 100 ? 0 : t.velocity
		const projected = Math.round(position.get() + (reduced ? 0 : v * 0.14))
		const next = cancel ? index : align === 'start' ? wrapCard(projected, skins.length) : clamp(projected, 0, skins.length - 1)
		const target = align === 'start' ? nearestCard(next, position.get(), skins.length) : next
		velocity.current = v
		if (next === index) {
			if (reduced) position.jump(target)
			else
				void animate(position, target, {
					type: 'spring',
					stiffness: 270,
					damping: 30,
					velocity: v,
				})
		} else onSelect(skins[next].id)
	}
	return (
		<div
			className="pass-carousel"
			data-design={design}
			data-mode={mode}
			data-align={align}
			role={design ? 'region' : undefined}
			aria-roledescription={design ? 'carrusel' : undefined}
			aria-label={design ? 'Portadas del pase' : undefined}
			onPointerDown={start}
			onPointerMove={move}
			onPointerUp={end}
			onPointerCancel={(e) => end(e, true)}
			onLostPointerCapture={(e) => {
				// Touch starts with implicit capture on the card. Its release while
				// transferring capture to this carousel is not a cancelled drag.
				if (e.target === e.currentTarget) end(e, true)
			}}
				onKeyDown={(e) => {
				if (!design) return
				if ((e.target as Element).closest('button, input, textarea, .pass-sticker, [role="slider"]')) return
				if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
				e.preventDefault()
				keyboard.current = true
				const next = index + (e.key === 'ArrowRight' ? 1 : -1)
				onSelect(skins[align === 'start' ? wrapCard(next, skins.length) : clamp(next, 0, skins.length - 1)].id)
			}}
		>
			<div ref={probe} className="pass-carousel-probe" />
			{skins.map((skin, i) => (
				<CarouselCard
					key={skin.id}
					index={i}
					selected={index === i}
					position={position}
					width={width}
					draft={{ ...draft, skin: skin.id, stickers: passStickers(draft, skin.id) }}
					align={align}
					phase={phase}
					tilt={!dragging && index === i}
					design={design}
					identity={identity}
					reader={reader}
					stickerCard={stickerCard}
					cardControls={cardControls}
					onSelect={() => {
						if (design && !moved.current) onSelect(skin.id)
					}}
				/>
			))}
			<motion.div
				className="pass-carousel-caption"
				aria-live="polite"
				aria-hidden={!design}
				initial={false}
				animate={{
					opacity: design ? 1 : 0,
					filter: design || reduced ? 'blur(0px)' : 'blur(4px)',
				}}
				transition={{ duration: 0.25 }}
			>
				{skins[index].name}
			</motion.div>
		</div>
	)
}

function CarouselCard({
	index,
	position,
	width,
	draft,
	phase,
	selected,
	tilt,
	onSelect,
	design,
	identity,
	reader,
	stickerCard,
	cardControls,
	align,
}: {
	index: number
	position: MotionValue<number>
	width: number
	draft: PassDraft
	phase: MotionValue<number>
	selected: boolean
	tilt: boolean
	onSelect: () => void
	design: boolean
	identity?: Identity
	reader?: ReaderCard
	stickerCard?: StickerCard
	cardControls?: Pick<ComponentProps<typeof PassCard>, 'back' | 'actions'>
	align: 'center' | 'start'
}) {
	const reduced = usePassReducedMotion()
	const distance = (v: number) => align === 'start' ? carouselOffset(index, v, skins.length) : index - v
	const transform = useTransform(position, (v) => {
		const d = distance(v),
			a = Math.abs(d),
			x =
				Math.sign(d) *
				(Math.min(a, 1) * (width + 28) + Math.max(0, a - 1) * width * 0.29)
		return `translateX(${x}px) perspective(1100px) rotateY(${-Math.sign(d) * Math.min(1, a) * 23}deg) scale(${1 - Math.min(3, a) * 0.06})`
	})
	const zIndex = useTransform(
		position,
		(v) => 20 - Math.round(Math.abs(distance(v)) * 2),
	)
	const opacity = useTransform(position, (v) => {
		const d = distance(v)
		if (align === 'start' && d < 0) return Math.max(0, 1 + d * 3)
		return Math.abs(d) > 4 ? 0 : Math.max(0.42, 1 - Math.abs(d) * 0.13)
	})
	const pointerEvents = useTransform(position, (v): 'auto' | 'none' =>
		(design || selected) && (align !== 'start' || distance(v) >= -0.1 && distance(v) <= 4) ? 'auto' : 'none')
	return (
		<motion.div
			className="pass-carousel-card"
			data-selected={selected}
			layout={!reduced && align !== 'start'}
			style={{
				zIndex,
				borderRadius: 17,
				pointerEvents,
			}}
			transition={{ layout: { duration: 0.48, ease: [0.65, 0, 0.35, 1] } }}
			role={design ? selected && cardControls ? 'group' : 'button' : undefined}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.target === e.currentTarget && design && (e.key === 'Enter' || e.key === ' ')) {
					e.preventDefault()
					onSelect()
				}
			}}
			aria-label={design ? `Portada ${skins[index].name}` : undefined}
			aria-pressed={design && !(selected && cardControls) ? selected : undefined}
			aria-hidden={!design && !selected}
			inert={!design && !selected}
			tabIndex={design && selected ? 0 : undefined}
		>
			<motion.div style={{ transform, opacity }}>
				<motion.div
					initial={false}
					animate={{
						opacity: design || selected ? 1 : 0,
						y: align === 'start' || reduced || design || selected ? 0 : 32,
						filter: reduced || design || selected ? 'blur(0px)' : 'blur(7px)',
					}}
					transition={{
						duration: 0.38,
						ease: [0.22, 1, 0.36, 1],
						delay:
							design && !selected
								? Math.min(0.12, Math.abs(index - position.get()) * 0.025)
								: 0,
					}}
				>
					<motion.div
						ref={selected ? reader?.ref : undefined}
						className={
							reader?.active && selected
								? 'pass-reader-card'
								: 'pass-moving-card'
						}
						style={selected ? reader?.style : undefined}
					>
						<div {...(selected ? reader?.props : {})}>
							<PassCard
								draft={draft}
								hologramPhase={phase}
								tilt={tilt && !reader?.active}
								{...(selected ? stickerCard : {})}
								{...(!design && selected ? identity : {})}
								{...(selected ? cardControls : {})}
							/>
						</div>
					</motion.div>
					<AnimatePresence>
						{!design && selected && identity?.back && (
							<motion.button
								key="eraser"
								className="pass-signature-eraser"
								aria-label="Borrar firma"
								title="Borrar firma"
								disabled={!draft.signature}
								onClick={identity.onErase}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ type: 'tween', duration: 0.18 }}
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.6"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="m14 3 7 7-10 10H6l-4-4L14 3Zm-7 8 7 7M10 20h11" />
								</svg>
							</motion.button>
						)}
					</AnimatePresence>
				</motion.div>
			</motion.div>
		</motion.div>
	)
}
