import { useRef, type CSSProperties } from 'react'
import { plateItem, type PlateId } from '../../shared/cosmetics'
import { Fx } from './Fx'
import { PLATE_FX } from './fx/specs'
import './cosmetics.css'

/**
 * A name on its plate: a 220 × 36 strip that scales with `--plate-h`. Commons are flat, rares animate with CSS,
 * epics and the legendary are baked shaders. `live` draws the shader for the one plate hero on screen.
 */
export function Plate({ plate, name, live = false, className }: { plate: PlateId | null | undefined; name: string; live?: boolean; className?: string }) {
	const item = plateItem(plate), root = useRef<HTMLSpanElement>(null)
	const spec = item?.spec
	if (!item || !spec) return <span className={`plate-name${className ? ` ${className}` : ''}`}>{name}</span>
	const style = { '--plate-ink': spec.ink, ...(spec.look === 'flat' && { '--plate-fill': spec.fill, '--plate-edge': spec.edge }) } as CSSProperties
	const kind = spec.look === 'flat' ? 'flat' : spec.look === 'animated' ? spec.style : spec.shader
	return <span ref={root} className={`plate${className ? ` ${className}` : ''}`} data-look={spec.look} data-plate={kind} style={style}>
		{spec.look === 'animated' && <PlateArt style={spec.style} />}
		{spec.look === 'shader' && <Fx id={`plate:${spec.shader}`} spec={PLATE_FX[spec.shader]} live={live} root={root} slot="plate" />}
		<span className="plate__name">{name}</span>
	</span>
}

/** The rares' moving layers. Only transform and opacity animate, so a full list stays on the compositor. */
function PlateArt({ style }: { style: 'aurora' | 'neon' | 'pixel' | 'tinta' }) {
	if (style === 'aurora') return <span className="plate__art" aria-hidden="true"><i /><i /><b /></span>
	if (style === 'neon') return <span className="plate__art" aria-hidden="true"><i /><b /></span>
	if (style === 'pixel') return <span className="plate__art" aria-hidden="true"><i /><b /></span>
	return <span className="plate__art" aria-hidden="true"><i className="plate__blot" /><i className="plate__drop" /><i className="plate__drop plate__drop--2" /></span>
}
