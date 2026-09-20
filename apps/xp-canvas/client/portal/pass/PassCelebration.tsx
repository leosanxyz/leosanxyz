import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type RefObject,
} from 'react'
import { motion } from 'motion/react'
import { usePassReducedMotion } from './usePassReducedMotion'

const colors = [
	'#fa568a',
	'#f89543',
	'#f2cd48',
	'#a0df44',
	'#42d783',
	'#39cfca',
	'#578cf2',
	'#9b67f2',
	'#df5be6',
]

const particles = Array.from({ length: 168 }, (_, i) => {
	const angle = (i * 137.508) % 360,
		radians = (angle * Math.PI) / 180
	// Start inside the pass. Every ray crosses its edge before fading out.
	const edge = Math.min(
		0.5 / Math.abs(Math.cos(radians)),
		1 / (2 * 0.686 * Math.abs(Math.sin(radians))),
	)
	const reach = 0.65 + (((i * 31) % 101) / 101) * 0.75
	const transform = Array.from({ length: 14 }, (_, frame) => {
		const t = frame / 13,
			progress = 1 - (1 - t) ** 2.7,
			stretch =
				t < 0.18 ? 0.65 + (0.35 * t) / 0.18 : 1 - ((t - 0.18) / 0.82) * 0.88
		const radius = `calc(var(--pass-card-w) * ${edge * (0.42 + 0.58 * progress)} + var(--pass-burst-reach) * ${reach * progress})`
		return `translate(-50%, -50%) rotate(${angle}deg) translateX(${radius}) scaleX(${stretch})`
	})
	return {
		color: colors[i % colors.length],
		length: 8 + ((i * 17) % 29),
		height: i % 5 ? 1 : 1.5,
		duration: 1.65 + (((i * 43) % 163) / 163) * 0.5,
		delay: 0.16 + (((i * 29) % 167) / 167) * 0.36,
		transform,
	}
})

export function PassCelebration({
	active,
	stage,
}: {
	active: boolean
	stage: RefObject<HTMLDivElement | null>
}) {
	const reduced = usePassReducedMotion()
	const [burst, setBurst] = useState(false)
	const layer = useRef<HTMLDivElement>(null)
	useEffect(() => {
		setBurst(active && !reduced)
	}, [active, reduced])
	useEffect(() => {
		if (!burst) return
		const timer = setTimeout(() => setBurst(false), 2800)
		return () => clearTimeout(timer)
	}, [burst])
	useLayoutEffect(() => {
		const element = layer.current,
			cardStage = stage.current
		if (!active || !burst || reduced || !element || !cardStage) return
		const position = () => {
			const bounds = element.getBoundingClientRect(),
				card = cardStage.getBoundingClientRect()
			element.style.setProperty(
				'--pass-burst-x',
				`${card.x + card.width / 2 - bounds.x}px`,
			)
			element.style.setProperty(
				'--pass-burst-y',
				`${card.y + card.height / 2 - bounds.y}px`,
			)
		}
		position()
		const observer = new ResizeObserver(position)
		observer.observe(element)
		observer.observe(cardStage)
		return () => observer.disconnect()
	}, [active, burst, reduced, stage])
	if (!active || !burst || reduced) return null
	return (
		<div ref={layer} className="pass-celebration-particles" aria-hidden="true">
			{particles.map((particle, i) => (
				<motion.span
					key={i}
					style={{
						color: particle.color,
						width: particle.length,
						height: particle.height,
					}}
					initial={{ transform: particle.transform[0], opacity: 0 }}
					animate={{
						transform: particle.transform,
						opacity: [0, 0.95, 0.8, 0],
					}}
					transition={{
						type: 'tween',
						duration: particle.duration,
						delay: particle.delay,
						// Distance samples decelerate; linear interpolation preserves that path.
						ease: 'linear',
						opacity: {
							type: 'tween',
							duration: particle.duration,
							delay: particle.delay,
							times: [0, 0.08, 0.55, 1],
							ease: 'linear',
						},
					}}
				/>
			))}
		</div>
	)
}
