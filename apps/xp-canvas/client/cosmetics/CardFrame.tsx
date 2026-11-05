import { type CSSProperties, type RefObject } from 'react'
import { frameItem, type FrameId } from '../../shared/cosmetics'
import { Fx } from './Fx'
import { FRAME_FX } from './fx/specs'
import './cosmetics.css'

const STAR = 'M12 0c.9 7 4.1 10.2 12 12-7.9 1.8-11.1 5-12 12-.9-7-4.1-10.2-12-12 7.9-1.8 11.1-5 12-12z'
const corners = ['tl', 'tr', 'br', 'bl'] as const

/**
 * A frame around a pass card. It fills the card's own box (the parent must be positioned) and spills past it where the frame does.
 * `hero` scales the lines to a full pass and draws a shader frame live, for the one frame hero on screen; `live` can hold that shader back.
 */
export function CardFrame({ frame, hero = false, live = hero, root }: { frame: FrameId | null | undefined; hero?: boolean; live?: boolean; root?: RefObject<HTMLElement | null> }) {
	const item = frameItem(frame)
	if (!item) return null
	const spec = item.spec
	const kind = spec.look === 'line' ? 'line' : spec.look === 'animated' ? spec.style : spec.shader
	return <span className="card-frame" data-look={spec.look} data-frame={kind} data-hero={hero || undefined} style={{ '--frame-color': spec.color } as CSSProperties} aria-hidden="true">
		{spec.look === 'line' && <i className="card-frame__line" />}
		{spec.look === 'animated' && spec.style === 'cinta' && <><i className="card-frame__dots" /><i className="card-frame__dots card-frame__dots--lit"><b /></i></>}
		{spec.look === 'animated' && spec.style === 'estrellas' && <><i className="card-frame__line" />{corners.map((corner, i) => <svg key={corner} className="card-frame__star" data-corner={corner} style={{ animationDelay: `${i * -0.7}s` }} viewBox="0 0 24 24"><path d={STAR} /></svg>)}</>}
		{spec.look === 'animated' && spec.style === 'neon' && <><i className="card-frame__tube" /><i className="card-frame__tube card-frame__tube--glow" /></>}
		{spec.look === 'shader' && <Fx id={`frame:${spec.shader}`} spec={FRAME_FX[spec.shader]} live={live} root={root} slot="frame" />}
	</span>
}
