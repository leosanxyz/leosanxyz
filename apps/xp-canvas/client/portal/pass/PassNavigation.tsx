import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { PassArrow } from './PassArrow'
import { usePassReducedMotion } from './usePassReducedMotion'

export function PassNavigation({
	visible,
	wide,
	canBack,
	disabled,
	nextDisabled,
	first,
	onBack,
	onNext,
}: {
	visible: boolean
	wide: boolean
	canBack: boolean
	disabled: boolean
	nextDisabled: boolean
	first: boolean
	onBack: () => void
	onNext: () => void
}) {
	const reduced = usePassReducedMotion(),
		root = useRef<HTMLDivElement>(null)
	const progress = useMotionValue(wide ? 1 : 0)
	const [size, setSize] = useState({ width: 380, height: 54 })
	const [moving, setMoving] = useState(false)
	useEffect(() => {
		const observer = new ResizeObserver(([entry]) =>
			setSize({
				width: entry.contentRect.width,
				height: entry.contentRect.height,
			}),
		)
		if (root.current) observer.observe(root.current)
		return () => observer.disconnect()
	}, [])
	useEffect(() => {
		if (reduced) {
			progress.jump(wide ? 1 : 0)
			setMoving(false)
			return
		}
		let current = true
		setMoving(true)
		const animation = animate(progress, wide ? 1 : 0, {
			type: 'tween',
			duration: 0.34,
			ease: [0.65, 0, 0.35, 1],
		})
		void animation.then(() => {
			if (current) setMoving(false)
		})
		return () => {
			current = false
			animation.stop()
		}
	}, [wide, reduced, progress])
	const clipPath = useTransform(
		progress,
		(v) =>
			`inset(0 ${(1 - v) * Math.max(0, size.width - size.height)}px 0 0 round 28px)`,
	)
	const arrowX = useTransform(
		progress,
		(v) => (v * (size.width - size.height)) / 2,
	)
	// Continue is revealed only after the back button has vacated its space.
	const nextOpacity = useTransform(progress, [0, 0.008, 0.025, 1], [1, 1, 0, 0])
	return (
		<motion.div
			ref={root}
			className="pass-navigation"
			data-has-back={canBack}
			data-wide={wide}
			initial={false}
			animate={{ opacity: visible ? 1 : 0 }}
			transition={{ type: 'tween', duration: 0.16 }}
			inert={!visible}
			aria-hidden={!visible}
		>
			<motion.div
				className="pass-nav-back-visual"
				style={{ clipPath }}
				animate={{ opacity: canBack ? 1 : 0 }}
				initial={false}
				transition={{ type: 'tween', duration: 0.16 }}
				aria-hidden="true"
			>
				<motion.span style={{ x: arrowX }}>
					<PassArrow direction="left" />
				</motion.span>
			</motion.div>
			<button
				className="pass-back-button"
				aria-label="Atrás"
				style={{
					width: wide ? '100%' : size.height,
					visibility: canBack ? 'visible' : 'hidden',
				}}
				disabled={disabled}
				onClick={onBack}
			/>
			<motion.button
				className="pass-primary"
				aria-label={first ? 'Comenzar' : 'Continuar'}
				aria-hidden={wide}
				inert={wide || moving}
				style={{ opacity: nextOpacity }}
				disabled={disabled || nextDisabled || wide || moving}
				onClick={onNext}
			>
				<PassArrow className="pass-next-arrow" />
			</motion.button>
		</motion.div>
	)
}
