import { useRef, type CSSProperties } from 'react'

const UP = 'cubic-bezier(.3, .7, .4, 1)', DOWN = 'cubic-bezier(.6, 0, .8, .4)'

/** One hop per shape, each landing its own way: the square turns, the circle squashes, the triangle spins, the bar stretches. */
function hop(shape: string, height: number): Keyframe[] {
	const top = `translateY(${-height}px)`
	switch (shape) {
		case 'square': return [{ transform: 'none', easing: UP }, { transform: `${top} rotate(45deg)`, offset: .45, easing: DOWN }, { transform: 'rotate(90deg)' }]
		case 'triangle': return [{ transform: 'none', easing: UP }, { transform: `${top} rotate(180deg)`, offset: .45, easing: DOWN }, { transform: 'rotate(360deg)' }]
		case 'bar': return [{ transform: 'none', easing: UP }, { transform: `${top} scaleY(1.2)`, offset: .45, easing: DOWN }, { transform: 'scale(1.15, .85)', offset: .78 }, { transform: 'none' }]
		default: return [{ transform: 'none', easing: UP }, { transform: top, offset: .45, easing: DOWN }, { transform: 'scale(1.18, .8)', offset: .78 }, { transform: 'none' }]
	}
}

/** The leosan.xyz logo, retold: the four shapes resting on black tiles, then the word. A click makes the shapes hop. */
export function XpLogo({ size = 40, className }: { size?: number; className?: string }) {
	const logo = useRef<HTMLSpanElement>(null), playing = useRef<Animation[]>([])
	function play() {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
		if (playing.current.some((animation) => animation.playState === 'running')) return
		const shapes = logo.current?.querySelectorAll<HTMLElement>('[data-shape]') ?? []
		playing.current = [...shapes].map((shape, index) => shape.animate(hop(shape.dataset.shape ?? '', size * .6), { duration: 520, delay: index * 70 }))
	}
	return <span ref={logo} className={className ? `xp-logo ${className}` : 'xp-logo'} role="img" aria-label="XP Canvas" onClick={play} style={{ '--logo-tile': `${size}px` } as CSSProperties}>
		<i data-shape="square" /><i data-shape="circle" /><span className="xp-logo__rise"><i data-shape="triangle" /><i data-shape="bar" /></span>
		<b>x</b><b>p</b><span className="xp-logo__word">canvas</span>
	</span>
}
