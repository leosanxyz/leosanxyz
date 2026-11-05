import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { CardMaterial, PassSkin } from '../../../../shared/pass'
import { skins } from '../catalog'
import { placement } from './assets'
import { materialAccent, materialSheet, type Sheet } from './bake'
import { materialName } from './materials'
import './material.css'

/**
 * A small card with its material: the shader baked once into a sprite sheet, then played with CSS `steps()`.
 * No live WebGL. It bakes only once it scrolls into view.
 */
export function MaterialMini({ skin, material, className }: { skin: PassSkin; material: CardMaterial; className?: string }) {
	const ref = useRef<HTMLSpanElement>(null)
	const [seen, setSeen] = useState(false), [sheet, setSheet] = useState<Sheet | null>(null)
	// each copy starts on another frame so a list does not beat in unison
	const [delay] = useState(() => -Math.random() * 5)
	useEffect(() => {
		const element = ref.current
		if (!element || seen) return
		const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setSeen(true) }, { rootMargin: '200px' })
		observer.observe(element)
		return () => observer.disconnect()
	}, [seen])
	useEffect(() => {
		setSheet(null)
		if (!seen || material === 'none' || typeof WebGL2RenderingContext === 'undefined') return
		let current = true
		materialSheet(skin, material).then((next) => { if (current) setSheet(next) }).catch((cause) => console.error(cause))
		return () => { current = false }
	}, [seen, skin, material])
	const entry = skins.find((s) => s.id === skin)
	const style = { '--material-accent': material === 'none' ? 'transparent' : materialAccent(material, skin) } as CSSProperties
	return <span ref={ref} className={`material-mini${className ? ` ${className}` : ''}`} data-skin={skin} data-material={material} data-ready={Boolean(sheet)} style={style} role="img" aria-label={`${entry?.name ?? 'Carta'} · ${materialName(material)}`}>
		<span className="material-mini-clip">
			{/* the plain art holds the place while the sheet bakes, and stays when there is no material */}
			{entry && <img src={entry.image} alt="" draggable={false} loading="lazy" style={{ objectPosition: placement(skin).position }} />}
			{sheet && <span className="material-mini-strip" style={{ backgroundImage: `url(${sheet.url})`, ['--n' as string]: sheet.frames, ['--loop' as string]: `${sheet.loop}s`, animationDelay: `${(delay % sheet.loop).toFixed(2)}s` }} />}
		</span>
	</span>
}
