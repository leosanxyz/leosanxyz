import { type RefObject, useEffect, useRef } from 'react'

interface PencilHoverPreviewProps {
	stageRef: RefObject<HTMLElement | null>
}

/** Shows the hover location reported by a nearby stylus without re-rendering on pointer moves. */
export function PencilHoverPreview({ stageRef }: PencilHoverPreviewProps) {
	const previewRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const stage = stageRef.current
		const preview = previewRef.current
		if (!stage || !preview) return

		let activePointerId: number | null = null
		let frame = 0
		let position: { x: number; y: number } | null = null

		const hide = () => {
			cancelAnimationFrame(frame)
			frame = 0
			position = null
			activePointerId = null
			preview.dataset.visible = 'false'
		}

		const update = (event: PointerEvent) => {
			if (event.pointerType !== 'pen') return
			if (event.buttons !== 0 || event.pressure > 0) {
				hide()
				return
			}

			if (event.target instanceof Element && event.target.closest('.resource-library, .ipad-toolbar, .tlui-layout')) {
				hide()
				return
			}
			activePointerId = event.pointerId
			position = { x: event.clientX, y: event.clientY }
			if (frame) return
			// Coalesced Pencil events can outnumber display frames. Read layout once per
			// frame, then write the transform, without scheduling React renders.
			frame = requestAnimationFrame(() => {
				frame = 0
				if (!position) return
				const bounds = stage.getBoundingClientRect()
				const x = position.x - bounds.left, y = position.y - bounds.top
				if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) { hide(); return }
				preview.style.transform = `translate3d(${x}px, ${y}px, 0)`
				preview.dataset.visible = 'true'
			})
		}

		const hideMatchingPen = (event: PointerEvent) => {
			if (event.pointerType !== 'pen') return
			if (activePointerId === null || event.pointerId === activePointerId) hide()
		}

		stage.addEventListener('pointerover', update, true)
		stage.addEventListener('pointermove', update, true)
		stage.addEventListener('pointerdown', hideMatchingPen, true)
		stage.addEventListener('pointerup', update, true)
		stage.addEventListener('pointerleave', hideMatchingPen, true)
		stage.addEventListener('pointercancel', hideMatchingPen, true)
		window.addEventListener('blur', hide)
		document.addEventListener('visibilitychange', hide)

		return () => {
			cancelAnimationFrame(frame)
			stage.removeEventListener('pointerover', update, true)
			stage.removeEventListener('pointermove', update, true)
			stage.removeEventListener('pointerdown', hideMatchingPen, true)
			stage.removeEventListener('pointerup', update, true)
			stage.removeEventListener('pointerleave', hideMatchingPen, true)
			stage.removeEventListener('pointercancel', hideMatchingPen, true)
			window.removeEventListener('blur', hide)
			document.removeEventListener('visibilitychange', hide)
		}
	}, [stageRef])

	return (
		<div
			ref={previewRef}
			className="pencil-hover-preview"
			data-visible="false"
			aria-hidden="true"
		>
			<span />
		</div>
	)
}
