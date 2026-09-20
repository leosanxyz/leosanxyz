import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { usePassReducedMotion } from './usePassReducedMotion'

export function IdentityControls({
	signing,
	naming,
	signed,
	onName,
	onSign,
}: {
	signing: boolean
	naming: boolean
	signed: boolean
	onName: () => void
	onSign: () => void
}) {
	const reduced = usePassReducedMotion()
	const progress = useMotionValue(signing ? 1 : 0)
	const clip = useTransform(
		progress,
		(v) => `inset(0 0 0 calc(${(1 - v) * 50}% + ${(1 - v) * 5}px) round 25px)`,
	)
	const nameOpacity = useTransform(progress, [0, 0.75, 1], [1, 0, 0])
	const nameTransform = useTransform(
		progress,
		(v) => `translateX(${-30 * v}px) scale(${1 - v * 0.12})`,
	)
	const nameBlur = useTransform(progress, (v) => `blur(${v * 5}px)`)
	useEffect(() => {
		if (reduced) {
			progress.jump(signing ? 1 : 0)
			return
		}
		const transition = animate(progress, signing ? 1 : 0, {
			type: 'tween',
			duration: 0.36,
			ease: [0.65, 0, 0.35, 1],
		})
		return () => transition.stop()
	}, [signing, reduced, progress])
	return (
		<div className="pass-identity-controls">
			<motion.button
				className="pass-tool pass-name-tool"
				inert={signing}
				aria-hidden={signing}
				style={{
					opacity: nameOpacity,
					transform: reduced ? 'none' : nameTransform,
					filter: reduced ? 'none' : nameBlur,
				}}
				onClick={onName}
			>
				{naming ? 'Listo' : 'Nombre'}
			</motion.button>
			<motion.button
				className="pass-tool pass-signature-tool"
				style={{
					left: signing ? 0 : 'calc(50% + 5px)',
					width: signing ? '100%' : 'calc(50% - 5px)',
					background: 'transparent',
				}}
				aria-label={
					signing
						? 'Listo, guardar firma'
						: signed
							? 'Firma guardada. Editar firma'
							: 'Firma'
				}
				onClick={onSign}
			/>
			<motion.div
				className="pass-signature-visual"
				style={{ clipPath: clip }}
				aria-hidden="true"
			>
				{[false, true].map((done) => (
					<motion.span
						key={done ? 'done' : 'sign'}
						aria-hidden="true"
						data-label={done ? 'done' : 'sign'}
						initial={false}
						style={{ left: done ? '50%' : 'calc(75% + 2.5px)' }}
						animate={{
							opacity: signing === done ? 1 : 0,
							filter: reduced || signing === done ? 'blur(0px)' : 'blur(5px)',
						}}
						transition={{
							type: 'tween',
							duration: signing === done ? 0.18 : 0.1,
							delay: !reduced && signing === done ? 0.36 : 0,
							ease: [0.22, 1, 0.36, 1],
						}}
					>
						{done ? 'Listo' : 'Firma'}
					</motion.span>
				))}
			</motion.div>
		</div>
	)
}
