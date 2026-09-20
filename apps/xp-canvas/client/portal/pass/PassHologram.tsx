import { useEffect } from 'react'
import {
	motion,
	useMotionValue,
	useTransform,
	type MotionValue,
} from 'motion/react'
import { passHologram, type PassDraft } from '../../../shared/pass'
import { hologramMask } from './hologramMasks'
import { foilLighting, foilPattern } from './foilLighting'

export function PassHologram({
	draft,
	phase,
	rotateX,
	rotateY,
	lamp,
}: {
	draft: PassDraft
	phase: MotionValue<number>
	rotateX: MotionValue<number>
	rotateY: MotionValue<number>
	lamp: MotionValue<{ x: number; y: number }>
}) {
	const holo = passHologram(draft)
	const hue = useMotionValue(holo.hue)
	useEffect(() => {
		hue.set(holo.hue)
	}, [holo.hue, hue])
	const light = useTransform(() => {
		const point = lamp.get()
		return foilLighting(
			rotateX.get(),
			rotateY.get(),
			hue.get(),
			point.x,
			point.y,
		)
	})
	const printTransform = useTransform(phase, (v) => {
		const pattern = foilPattern(v)
		return `rotate(${pattern.rotation}deg) scale(${pattern.scale})`
	})
	const spectrum = useTransform(light, (v) => v.spectrum)
	const illumination = useTransform(light, (v) => v.illumination)
	const glare = useTransform(light, (v) => v.glare)
	return (
		<div
			className="pass-hologram"
			data-area={holo.area}
			style={{
				maskImage: hologramMask(draft.skin, holo.area),
				maskComposite:
					draft.skin === 'xp' && holo.area === 'background'
						? 'exclude'
						: undefined,
			}}
			aria-hidden="true"
		>
			<motion.div
				className="pass-foil-reflection"
				style={{ maskImage: illumination }}
			>
				<motion.div
					className={`pass-foil-print pass-pattern-${holo.pattern}`}
					style={{ backgroundImage: spectrum, transform: printTransform }}
				/>
			</motion.div>
			<motion.div
				className="pass-foil-glare"
				style={{ backgroundImage: glare }}
			/>
		</div>
	)
}
