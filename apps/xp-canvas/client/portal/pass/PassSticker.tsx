import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue } from 'motion/react'
import type { PassSticker as Sticker } from '../../../shared/pass'
import { stickerArt } from './catalog'
import { StickerArt } from './StickerArt'
import { cardProjector } from './cardProjection'
import {
	clamp,
	isOnCard,
	resizeSticker,
	wrapAngle,
	type CardRect,
} from './stickerGeometry'

type Mode = 'move' | 'rotate' | [number, number]
export function PassSticker({
	sticker,
	edit,
	selected,
	onSelect,
	onChange,
	onRemove,
}: {
	sticker: Sticker
	edit: boolean
	selected: boolean
	onSelect?: (id: string) => void
	onChange?: (s: Sticker) => void
	onRemove?: (id: string, x: number, y: number) => void
}) {
	const root = useRef<HTMLDivElement>(null)
	const [dragPreview, setDragPreview] = useState<{ width: number; rotation: number } | null>(null)
	const previewX = useMotionValue(0), previewY = useMotionValue(0), previewOpacity = useMotionValue(1)
	const tracking = useRef<{
		id: number
		x: number
		y: number
		rect: CardRect
		mode: Mode
		base: number
		value: Sticker
		angle: number
		point: (x: number, y: number) => { x: number; y: number }
		screen: { x: number; y: number; dx: number; dy: number }
		moving: boolean
	} | null>(null)
	const transform = `translate(-50%, -50%) rotate(${sticker.rotation}deg)`
	useEffect(() => {
		if (!edit) { tracking.current = null; reset() }
	}, [edit])
	function start(e: PointerEvent<HTMLElement>, mode: Mode) {
		if (!edit || e.button !== 0 || tracking.current) return
		e.preventDefault()
		e.stopPropagation()
		const { rect, point } = cardProjector(
			root.current!.closest<HTMLElement>('.pass-card')!,
		)
		const p = point(e.clientX, e.clientY),
			x = (p.x / 100) * rect.width,
			y = (p.y / 100) * rect.height
		const cx = (sticker.x / 100) * rect.width,
			cy = (sticker.y / 100) * rect.height
		const screen = root.current!.getBoundingClientRect()
		tracking.current = {
			id: e.pointerId,
			x,
			y,
			rect,
			mode,
			base: root.current!.offsetWidth / sticker.scale,
			value: sticker,
			angle: (Math.atan2(y - cy, x - cx) * 180) / Math.PI,
			point,
			screen: { x: e.clientX, y: e.clientY, dx: screen.x + screen.width / 2 - e.clientX, dy: screen.y + screen.height / 2 - e.clientY },
			moving: false,
		}
		e.currentTarget.setPointerCapture(e.pointerId)
		onSelect?.(sticker.id)
	}
	function reset() {
		setDragPreview(null)
		if (!root.current) return
		root.current.style.transform = transform
		root.current.style.opacity = ''
		delete root.current.dataset.outside
	}
	function move(e: PointerEvent<HTMLElement>) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		e.stopPropagation()
		const p = t.point(e.clientX, e.clientY),
			px = (p.x / 100) * t.rect.width,
			py = (p.y / 100) * t.rect.height
		const dx = px - t.x,
			dy = py - t.y
		if (t.mode === 'move') {
			t.value = {
				...sticker,
				x: sticker.x + (dx / t.rect.width) * 100,
				y: sticker.y + (dy / t.rect.height) * 100,
			}
			previewX.set(e.clientX + t.screen.dx)
			previewY.set(e.clientY + t.screen.dy)
			previewOpacity.set(isOnCard(t.value) ? 1 : 0.55)
			if (!t.moving && Math.hypot(e.clientX - t.screen.x, e.clientY - t.screen.y) > 3) {
				t.moving = true
				root.current!.style.opacity = '0'
				setDragPreview({ width: t.base * sticker.scale, rotation: sticker.rotation })
			}
		} else if (t.mode === 'rotate') {
			const cx = (sticker.x / 100) * t.rect.width,
				cy = (sticker.y / 100) * t.rect.height
			t.value = {
				...sticker,
				rotation: wrapAngle(
					sticker.rotation +
						(Math.atan2(py - cy, px - cx) * 180) / Math.PI -
						t.angle,
				),
			}
		} else t.value = resizeSticker(sticker, dx, dy, t.mode, t.rect, t.base)
		const tx = ((t.value.x - sticker.x) / 100) * t.rect.width,
			ty = ((t.value.y - sticker.y) / 100) * t.rect.height
		if (t.mode !== 'move') root.current!.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) rotate(${t.value.rotation}deg) scale(${t.value.scale / sticker.scale})`
		root.current!.dataset.outside = String(
			t.mode === 'move' && !isOnCard(t.value),
		)
	}
	function end(e: PointerEvent<HTMLElement>, cancel = false) {
		const t = tracking.current
		if (!t || t.id !== e.pointerId) return
		tracking.current = null
		reset()
		if (cancel) return
		if (t.mode === 'move' && !isOnCard(t.value))
			onRemove?.(sticker.id, e.clientX, e.clientY)
		else
			onChange?.({
				...t.value,
				x: clamp(t.value.x, 8, 92),
				y: clamp(t.value.y, 8, 92),
			})
	}
	function key(e: KeyboardEvent, mode: Mode = 'move') {
		if (e.key === 'Escape') {
			tracking.current = null
			reset()
			return
		}
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault()
			const r = root.current!.getBoundingClientRect()
			onRemove?.(sticker.id, r.x + r.width / 2, r.y + r.height / 2)
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
		e.stopPropagation()
		const factor = e.shiftKey ? 5 : 1
		if (mode === 'rotate')
			onChange?.({
				...sticker,
				rotation: wrapAngle(
					sticker.rotation + (delta[0] - delta[1]) * factor * 5,
				),
			})
		else if (Array.isArray(mode))
			onChange?.({
				...sticker,
				scale: clamp(
					sticker.scale + (delta[0] - delta[1]) * factor * 0.05,
					0.6,
					1.6,
				),
			})
		else
			onChange?.({
				...sticker,
				x: clamp(sticker.x + delta[0] * factor, 8, 92),
				y: clamp(sticker.y + delta[1] * factor, 8, 92),
			})
	}
	return (
		<><div
			ref={root}
			className={`pass-sticker ${edit && selected ? 'is-selected' : ''}`}
			style={{
				left: `${sticker.x}%`,
				top: `${sticker.y}%`,
				width: `calc(clamp(42px, 19cqw, 54px) * ${sticker.scale})`,
				transform,
			}}
			data-sticker-id={sticker.id}
			onPointerMove={move}
			onPointerUp={end}
			onPointerCancel={(e) => end(e, true)}
			onLostPointerCapture={(e) => end(e, true)}
		>
			{edit ? (
				<button
					className="pass-sticker-drag"
					aria-label={`Sticker ${stickerArt[sticker.art].name}. Arrastra fuera para quitarlo.`}
					aria-pressed={selected}
					onPointerDown={(e) => start(e, 'move')}
					onKeyDown={(e) => key(e)}
					onClick={() => onSelect?.(sticker.id)}
				>
					<StickerArt art={sticker.art} />
				</button>
			) : (
				<span role="img" aria-label={stickerArt[sticker.art].name}>
					<StickerArt art={sticker.art} />
				</span>
			)}
			{edit && selected && (
				<div className="pass-sticker-frame">
					{(
						[
							[-1, -1],
							[1, -1],
							[-1, 1],
							[1, 1],
						] as [number, number][]
					).map((corner, i) => (
						<button
							key={i}
							className={`pass-sticker-corner corner-${i}`}
							aria-label={`Cambiar tamaño, esquina ${i + 1}`}
							onPointerDown={(e) => start(e, corner)}
							onKeyDown={(e) => key(e, corner)}
						/>
					))}
					<button
						className="pass-sticker-rotate"
						aria-label="Rotar sticker"
						onPointerDown={(e) => start(e, 'rotate')}
						onKeyDown={(e) => key(e, 'rotate')}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.7"
						>
							<path d="M19 9a7 7 0 1 0 .5 6M19 4v5h-5" />
						</svg>
					</button>
				</div>
			)}
		</div>
		{dragPreview && createPortal(<motion.div className="pass-sticker-drag-preview" aria-hidden="true"
			style={{ x: previewX, y: previewY, opacity: previewOpacity, width: dragPreview.width }}>
			<div style={{ transform: `translate(-50%, -50%) rotate(${dragPreview.rotation}deg)` }}><StickerArt art={sticker.art} /></div>
		</motion.div>, document.body)}</>
	)
}
