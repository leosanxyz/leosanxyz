import {
	useEffect,
	useRef,
	useState,
	forwardRef,
	type PointerEvent,
	type ReactNode,
	type ComponentProps,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useIsPresent, useMotionValue } from 'motion/react'
import type { PassDraft, PassSticker, StickerId } from '../../../shared/pass'
import type { PassCard } from './PassCard'
import { StickerArt } from './StickerArt'
import { packs, stickerArt } from './catalog'
import { clamp, isOnCard } from './stickerGeometry'
import { cardProjector } from './cardProjection'
import { usePassReducedMotion } from './usePassReducedMotion'
import { remainingStickerCount } from './stickerInventory'
import type { PlayPassSound } from './PassAudio'

export type StickerCard = Pick<
	ComponentProps<typeof PassCard>,
	'edit' | 'selected' | 'onSelect' | 'onRemoveSticker' | 'onSticker'
>

export function StickerEditor({
	draft,
	active,
	children,
	onChange,
	announce,
	onSound,
	inventoryVisible = active,
	stationaryInventory = false,
}: {
	draft: PassDraft
	active: boolean
	children: (card: StickerCard) => ReactNode
	onChange: (stickers: PassSticker[]) => void
	announce: (text: string) => void
	onSound?: PlayPassSound
	inventoryVisible?: boolean
	stationaryInventory?: boolean
}) {
	const reduced = usePassReducedMotion(),
		card = useRef<HTMLDivElement>(null)
	const [selected, setSelected] = useState<string>(),
		[ghost, setGhost] = useState<StickerId>()
	const [poofs, setPoofs] = useState<{ id: number; x: number; y: number }[]>([])
	const tracking = useRef<{
		id: number
		art: StickerId
		x: number
		y: number
		moved: boolean
	} | null>(null)
	const gx = useMotionValue(0),
		gy = useMotionValue(0)
	const suppressClick = useRef(false)
	const poofId = useRef(0)
	useEffect(() => {
		if (!active) {
			setSelected(undefined)
			setGhost(undefined)
			tracking.current = null
			return
		}
		const deselect = (e: globalThis.PointerEvent) => {
			if (
				e.target instanceof Element &&
				!e.target.closest('.pass-sticker, .pass-sticker-palette')
			)
				setSelected(undefined)
		}
		document.addEventListener('pointerdown', deselect, true)
		return () => document.removeEventListener('pointerdown', deselect, true)
	}, [active])
	function put(art: StickerId, x: number, y: number) {
		if (
			draft.stickers.length >= 8 ||
			!remainingStickerCount(draft.stickers, art)
		)
			return
		const id = crypto.randomUUID()
		onChange([
			...draft.stickers,
			{
				id,
				art,
				x: clamp(x, 8, 92),
				y: clamp(y, 8, 92),
				rotation: -8,
				scale: 1,
			},
		])
		setSelected(id)
		announce(`Sticker de ${stickerArt[art].name.toLowerCase()} colocado.`)
	}
	function remove(id: string, x: number, y: number) {
		onChange(draft.stickers.filter((s) => s.id !== id))
		setSelected(undefined)
		poof(x, y)
		announce('Sticker retirado.')
	}
	function poof(x: number, y: number) {
		onSound?.('pop')
		const id = ++poofId.current
		setPoofs((current) => [...current, { id, x, y }])
	}
	function start(e: PointerEvent<HTMLButtonElement>, art: StickerId) {
		if (
			e.button !== 0 ||
			tracking.current ||
			draft.stickers.length >= 8 ||
			!remainingStickerCount(draft.stickers, art)
		)
			return
		e.preventDefault()
		suppressClick.current = false
		tracking.current = {
			id: e.pointerId,
			art,
			x: e.clientX,
			y: e.clientY,
			moved: false,
		}
		gx.set(e.clientX)
		gy.set(e.clientY)
		e.currentTarget.setPointerCapture(e.pointerId)
	}
	function move(e: PointerEvent<HTMLButtonElement>) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 4) {
			t.moved = true
			setGhost(t.art)
		}
		gx.set(e.clientX)
		gy.set(e.clientY)
	}
	function end(e: PointerEvent<HTMLButtonElement>, cancel = false) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		tracking.current = null
		setGhost(undefined)
		suppressClick.current = true
		if (cancel || !card.current) return
		if (!t.moved) {
			put(t.art, 50, 45)
			return
		}
		const p = cardProjector(
			card.current.querySelector<HTMLElement>(
				'.pass-carousel-card[data-selected="true"] .pass-card',
			)!,
		).point(e.clientX, e.clientY)
		if (isOnCard(p)) put(t.art, p.x, p.y)
		else {
			poof(e.clientX, e.clientY)
			announce('Sticker devuelto al inventario.')
		}
	}
	return (
		<div
			className="pass-sticker-editor"
			data-active={active}
			onKeyDown={(e) => {
				if (e.key === 'Escape') setSelected(undefined)
			}}
		>
			<div
				ref={card}
				className="pass-stage-card"
				onPointerDown={(e) => {
					if (!(e.target as Element).closest('.pass-sticker'))
						setSelected(undefined)
				}}
			>
				{children({
					edit: active,
					selected,
					onSelect: setSelected,
					onRemoveSticker: remove,
					onSticker: (sticker) =>
						onChange(
							draft.stickers.map((s) => (s.id === sticker.id ? sticker : s)),
						),
				})}
			</div>
			<AnimatePresence initial={false} mode={stationaryInventory ? 'sync' : 'popLayout'}>
				{inventoryVisible && (
					<StickerInventory key="inventory" active={active} reduced={reduced} stationary={stationaryInventory}>
						<div
							className="pass-sticker-palette"
							role="group"
							aria-label="Stickers disponibles"
						>
							{packs[draft.skin].map((id) => {
								const quantity = remainingStickerCount(draft.stickers, id)
								return (
									<button
										key={id}
										aria-label={`Arrastrar ${stickerArt[id].name}`}
										aria-description={
											quantity
												? '1 disponible'
												: 'Ya está colocado en tu tarjeta'
										}
										disabled={draft.stickers.length >= 8 || quantity === 0}
										onPointerDown={(e) => start(e, id)}
										onPointerMove={move}
										onPointerUp={end}
										onPointerCancel={(e) => end(e, true)}
										onLostPointerCapture={(e) => end(e, true)}
										onClick={(e) => {
											if (e.detail === 0 || !suppressClick.current)
												put(id, 50, 45)
										}}
									>
										<StickerArt art={id} />
										<span
											className="pass-inventory-quantity"
											aria-hidden="true"
										>
											{quantity}
										</span>
									</button>
								)
							})}
							{Array.from({ length: 16 - packs[draft.skin].length }, (_, i) => (
								<span
									className="pass-inventory-empty"
									key={`empty-${i}`}
									aria-hidden="true"
								/>
							))}
						</div>
					</StickerInventory>
				)}
			</AnimatePresence>
			<p className="pass-sr-only" aria-hidden={!active}>
				Haz clic o arrastra un sticker al pase. Con teclado, pulsa Enter para
				colocarlo. Las flechas lo mueven, sus esquinas cambian el tamaño y el
				control superior lo gira. Suprimir lo retira.
			</p>
			{createPortal(
				<>
					{ghost && (
						<motion.div className="pass-sticker-ghost" style={{ x: gx, y: gy }}>
							<StickerArt art={ghost} />
						</motion.div>
					)}
					<AnimatePresence>
						{poofs.map((p) => (
							<motion.div
								key={p.id}
								className="pass-poof"
								style={{ left: p.x, top: p.y }}
								initial={{ opacity: 1 }}
								animate={{ opacity: [1, 1, 0] }}
								transition={{
									duration: reduced ? 0.16 : 0.42,
									times: [0, 0.55, 1],
								}}
								onAnimationComplete={() =>
									setPoofs((current) =>
										current.filter((item) => item.id !== p.id),
									)
								}
								aria-hidden="true"
							>
								<svg viewBox="0 0 160 160">
									{Array.from({ length: 7 }, (_, i) => {
										const angle = (i / 7) * Math.PI * 2,
											x = Math.cos(angle),
											y = Math.sin(angle)
										return (
											<motion.g
												key={i}
												initial={{ x: x * 15, y: y * 15, scale: 0.7 }}
												animate={{
													x: x * (reduced ? 15 : 46),
													y: y * (reduced ? 15 : 46),
													scale: reduced ? 0.7 : [0.7, 1.08, 0.95],
												}}
												style={{ transformOrigin: '80px 80px' }}
												transition={{
													duration: 0.38,
													ease: [0.19, 1, 0.22, 1],
												}}
											>
												<path
													d="M65 82c-8-2-9-14-2-18-2-10 13-16 20-9 9-4 19 5 16 14 10 8 2 21-8 19-6 10-22 7-26-6Z"
													fill="#d1d1cf"
												/>
												<path
													d="M65 77c-8-2-9-14-2-18-2-10 13-16 20-9 9-4 19 5 16 14 10 8 2 21-8 19-6 10-22 7-26-6Z"
													fill="white"
												/>
											</motion.g>
										)
									})}
								</svg>
							</motion.div>
						))}
					</AnimatePresence>
				</>,
				document.body,
			)}
		</div>
	)
}

const StickerInventory = forwardRef<HTMLDivElement, { active: boolean; reduced: boolean; stationary: boolean; children: ReactNode }>(function StickerInventory({ active, reduced, stationary, children }, ref) {
	const present = useIsPresent()
	return <motion.div ref={ref} className="pass-sticker-inventory" inert={!active || !present} aria-disabled={!active || !present}
		layout={reduced || stationary ? false : 'position'}
		initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(4px)' }}
		animate={{ opacity: active ? 1 : 0.4, filter: reduced ? 'none' : 'blur(0px)' }}
		exit={{ opacity: 0, filter: reduced ? 'none' : 'blur(4px)', transition: { duration: 0.14 } }}
		transition={{ type: 'tween', duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
	>{children}</motion.div>
})
