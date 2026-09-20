import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
	motion,
	useMotionValue,
	useSpring,
	useTransform,
	useMotionTemplate,
	type MotionValue,
} from 'motion/react'
import {
	defaultHologram,
	type PassDraft,
	type PassSticker,
	type PassSignature,
} from '../../../shared/pass'
import { skins } from './catalog'
import { SignatureInk, SignaturePad } from './SignaturePad'
import { usePassReducedMotion } from './usePassReducedMotion'
import { PassSticker as Sticker } from './PassSticker'
import { PassHologram } from './PassHologram'
import { unprojectCardPoint } from './cardProjection'

export function PassCard({
	draft,
	edit = false,
	selected,
	onSelect,
	onSticker,
	back = false,
	tilt = true,
	signing = false,
	onSignature,
	naming = false,
	onName,
	onNameDone,
	onRemoveSticker,
	hologramPhase,
	actions,
}: {
	draft: PassDraft
	edit?: boolean
	selected?: string
	onSelect?: (id: string) => void
	onSticker?: (sticker: PassSticker) => void
	back?: boolean
	tilt?: boolean
	signing?: boolean
	onSignature?: (signature: PassSignature) => void
	naming?: boolean
	onName?: (name: string) => void
	onNameDone?: () => void
	onRemoveSticker?: (id: string, x: number, y: number) => void
	hologramPhase?: MotionValue<number>
	actions?: ReactNode
}) {
	const reduced = usePassReducedMotion(),
		skin = skins.find((s) => s.id === draft.skin)!
	const root = useRef<HTMLDivElement>(null)
	const rx = useMotionValue(0),
		ry = useMotionValue(0)
	const rotateX = useSpring(rx, { stiffness: 220, damping: 28 }),
		rotateY = useSpring(ry, { stiffness: 220, damping: 28 })
	const cursor = useMotionValue<{ x: number; y: number; rect: DOMRect } | null>(
		null,
	)
	const resetTilt = useCallback(() => {
		rx.set(0)
		ry.set(0)
		cursor.set(null)
	}, [rx, ry, cursor])
	useEffect(() => {
		window.addEventListener('blur', resetTilt)
		return () => window.removeEventListener('blur', resetTilt)
	}, [resetTilt])
	const lamp = useTransform(() => {
		const point = cursor.get(),
			x = rotateX.get(),
			y = rotateY.get()
		if (!point) return { x: 50, y: 40 }
		return unprojectCardPoint(
			point.x,
			point.y,
			point.rect,
			new DOMMatrixReadOnly(`rotateX(${x}deg) rotateY(${y}deg)`),
			1100,
		)
	})
	const surfaceTilt = useMotionTemplate`rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
	const holo = draft.hologram ?? defaultHologram()
	const ownPhase = useMotionValue(holo.phase),
		phase = hologramPhase ?? ownPhase
	useEffect(() => {
		ownPhase.set(holo.phase)
	}, [holo.phase, ownPhase])
	const interactiveTilt = !reduced && tilt && !signing && !naming
	useEffect(() => {
		if (!interactiveTilt) {
			rx.set(0)
			ry.set(0)
			if (reduced) {
				rotateX.jump(0)
				rotateY.jump(0)
				cursor.set(null)
			}
		}
	}, [interactiveTilt, reduced, rx, ry, rotateX, rotateY, cursor])
	useEffect(() => {
		if (!edit || !interactiveTilt) return
		const follow = (e: globalThis.PointerEvent) => {
			if (e.pointerType !== 'mouse' || !root.current) return
			const r = root.current.getBoundingClientRect()
			if (
				e.clientX < r.left ||
				e.clientX > r.right ||
				e.clientY < r.top ||
				e.clientY > r.bottom
			) {
				resetTilt()
				return
			}
			cursor.set({ x: e.clientX, y: e.clientY, rect: r })
			rx.set(-((e.clientY - r.top) / r.height - 0.5) * 12)
			ry.set(((e.clientX - r.left) / r.width - 0.5) * 12)
		}
		// Palette drags hold pointer capture, so their events do not target the card.
		// Existing sticker gestures stop bubbling and keep the current plane still.
		document.addEventListener('pointermove', follow)
		return () => document.removeEventListener('pointermove', follow)
	}, [edit, interactiveTilt, rx, ry, cursor, resetTilt])
	const previousSide = useRef(back)
	const previousMotion = useRef(reduced)
	const [turning, setTurning] = useState(false)
	const hideActions = !reduced && (turning || previousSide.current !== back)
	useEffect(() => {
		previousSide.current = back
	}, [back])
	useEffect(() => {
		previousMotion.current = reduced
		if (reduced) setTurning(false)
	}, [reduced])
	return (
		<div
			ref={root}
			className={`pass-card pass-skin-${draft.skin}`}
			data-testid="pass-card"
			data-back={back}
			data-edit={edit}
			data-reduced={Boolean(reduced)}
			onPointerLeave={() => { if (!edit) resetTilt() }}
			onPointerCancel={resetTilt}
			onPointerMove={(e) => {
				if (edit || !interactiveTilt || e.pointerType !== 'mouse') return
				const r = e.currentTarget.getBoundingClientRect()
				cursor.set({ x: e.clientX, y: e.clientY, rect: r })
				rx.set(-((e.clientY - r.top) / r.height - 0.5) * 12)
				ry.set(((e.clientX - r.left) / r.width - 0.5) * 12)
			}}
		>
			<motion.div
				className="pass-card-tilt"
				style={{ transform: reduced ? 'none' : surfaceTilt }}
			>
				<motion.div
					className="pass-card-flipper"
					initial={false}
					animate={{
						transform: reduced ? 'none' : `rotateY(${back ? 180 : 0}deg)`,
					}}
					transition={{
						duration: reduced || previousMotion.current !== reduced ? 0 : 0.48,
						ease: [0.65, 0, 0.35, 1],
					}}
					onAnimationStart={() => { if (!reduced) setTurning(true) }}
					onAnimationComplete={() => setTurning(false)}
				>
					<div className="pass-face pass-front" aria-hidden={back} inert={back}>
						<div className="pass-visuals">
							<div
								className="pass-art"
								style={{ filter: `brightness(${1 + draft.brightness / 100})` }}
							>
								<img
									src={skin.image}
									alt={`Arte de ${skin.name}`}
									draggable={false}
								/>
							</div>
							{draft.skin !== 'xp' && (
								<img
									className="pass-art-blur"
									src={skin.image}
									alt=""
									draggable={false}
								/>
							)}
							{draft.finish !== 'matte' && (
								<PassHologram
									draft={draft}
									phase={phase}
									rotateX={rotateX}
									rotateY={rotateY}
									lamp={lamp}
								/>
							)}
							<div className="pass-shade" />
						</div>
						<div className="pass-top">
							<span>XP / CLASS PASS</span>
							<span>2026</span>
						</div>
						<div className="pass-card-caption">
							{naming ? (
								<input
									className="pass-inline-name"
									aria-label="Nombre en tu pase"
									autoFocus
									value={draft.name}
									maxLength={32}
									autoComplete="nickname"
									spellCheck={false}
									onFocus={(e) => e.currentTarget.select()}
									onChange={(e) => onName?.(e.target.value)}
									onKeyDown={(e) => {
										if (
											(e.key === 'Enter' || e.key === 'Escape') &&
											draft.name.trim()
										)
											onNameDone?.()
									}}
								/>
							) : (
								<strong>{draft.name || 'Tu nombre'}</strong>
							)}
						</div>
						{draft.stickers.map((sticker) => (
							<Sticker
								key={sticker.id}
								sticker={sticker}
								edit={edit}
								selected={selected === sticker.id}
								onSelect={onSelect}
								onChange={onSticker}
								onRemove={onRemoveSticker}
							/>
						))}
					</div>
					<div
						className="pass-face pass-card-back"
						aria-hidden={!back}
						inert={!back}
					>
						<div className="pass-back-texture" aria-hidden="true" />
						<div className="pass-top">
							<span>XP / CLASS PASS</span>
							<span>2026</span>
						</div>
						<div className="pass-back-name">{draft.name || 'Tu nombre'}</div>
						<div className="pass-signing-area">
							{signing && onSignature ? (
								<SignaturePad
									signature={draft.signature}
									onChange={onSignature}
								/>
							) : (
								<svg
									className="pass-saved-signature"
									viewBox="0 0 600 340"
									role="img"
									aria-label="Tu firma"
								>
									<SignatureInk signature={draft.signature} />
								</svg>
							)}
							<span className="pass-signing-line" />
							<span className="pass-signing-label">
								{draft.signature ? 'TU FIRMA' : 'FIRMA AQUÍ'}
							</span>
						</div>
					</div>
				</motion.div>
				{actions && <motion.div className="pass-card-actions" data-hidden={hideActions} inert={hideActions} aria-hidden={hideActions}
					initial={false}
					animate={{ opacity: hideActions ? 0 : 1, filter: reduced ? 'none' : `blur(${hideActions ? 4 : 0}px)` }}
					transition={{ duration: hideActions ? 0.1 : 0.18, ease: [0.22, 1, 0.36, 1] }}
				>{actions}</motion.div>}
			</motion.div>
		</div>
	)
}
