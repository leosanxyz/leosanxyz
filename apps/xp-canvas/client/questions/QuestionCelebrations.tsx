import { useMemo, type CSSProperties } from 'react'
import type { QuestionFeedback } from '../../shared/questionShape'

const EMOJIS = ['🥳', '⭐', '🎉']
const COLORS = ['#ffcf40', '#ff699d', '#54cde2', '#a58aff', '#74d99a', '#ff935b']

// Fixed trajectories keep animation off React's render loop. Each column gets
// successive resting heights so the paper and emojis collect above the floor.
function makeParticles(id: string) {
	let seed = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 1)
	const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
	const columns = Array<number>(24).fill(0)
	return Array.from({ length: 144 }, (_, index) => {
		const emoji = index % 4 === 0 ? EMOJIS[(index / 4) % 3] : null
		const size = emoji ? 78 + random() * 36 : 16 + random() * 14
		const column = Math.floor(random() * columns.length)
		const pile = columns[column]
		columns[column] += emoji ? size * .55 : size * .45
		return { emoji, style: {
			left: `${(column + .2 + random() * .6) / columns.length * 100}%`,
			width: size, height: emoji ? size : size * .5, fontSize: size,
			backgroundColor: emoji ? undefined : COLORS[index % COLORS.length],
			borderRadius: emoji ? undefined : index % 3 === 0 ? '50%' : '2px',
			'--fall-y': `calc(100dvh + 120px - ${size + pile}px)`,
			'--drift': `${(random() - .5) * 50}px`,
			'--spin': `${(random() - .5) * (emoji ? 80 : 640)}deg`,
			animationDuration: `${950 + random() * 550}ms`,
			animationDelay: `${random() * 260}ms`,
		} as CSSProperties }
	})
}

function Celebration({ id }: { id: string }) {
	const particles = useMemo(() => makeParticles(id), [id])
	return <div className="question-celebration" data-celebration-id={id} aria-hidden="true">
		{particles.map((particle, index) => <span key={index} className="question-celebration__particle" style={particle.style}>{particle.emoji}</span>)}
		<span className="question-celebration__reduced">🥳 ⭐ 🎉</span>
	</div>
}

export function QuestionCelebrations({ feedback }: { feedback: QuestionFeedback[] }) {
	return <>{feedback.filter((event) => event.correct).slice(-3).map((event) => <Celebration key={event.id} id={event.id} />)}</>
}
