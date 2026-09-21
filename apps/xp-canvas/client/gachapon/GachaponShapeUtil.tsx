import { useState, type CSSProperties } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor, useValue } from 'tldraw'
import { gachaponShapeProps, gachaponShapeMigrations, type GachaponShape } from '../../shared/gachaponShape'
import { REWARD_SKINS } from '../../shared/pass'
import { skins } from '../portal/pass/catalog'
import { Icon } from '../components/Icon'
import { useGachapon } from './GachaponContext'
import './gachapon.css'

export class GachaponShapeUtil extends BaseBoxShapeUtil<GachaponShape> {
	static override type = 'gachapon' as const
	static override props = gachaponShapeProps
	static override migrations = gachaponShapeMigrations
	override getDefaultProps(): GachaponShape['props'] { return { cost: 0, w: 300, h: 440, pool: [...REWARD_SKINS], allowedUserIds: [], usedUserIds: [], revision: crypto.randomUUID() } }
	override canEdit() { return false }
	override canResize() { return false }
	override getText() { return 'Gachapon' }
	override component(shape: GachaponShape) { return <Machine shape={shape} /> }
	override toSvg(shape: GachaponShape) {
		return <g>
			<rect width={300} height={440} rx={26} fill="#c9ddf1" stroke="#91afcb" strokeWidth={3} />
			<text x={150} y={38} textAnchor="middle" fontFamily="sans-serif" fontSize={22} fill="#23344c">GACHA XP</text>
			<rect x={20} y={62} width={260} height={208} rx={25} fill="#e6f1fb" stroke="#91afcb" strokeWidth={4} />
			{Array.from({ length: 12 }, (_, i) => <circle key={i} cx={55 + i % 4 * 62} cy={235 - Math.floor(i / 4) * 49} r={27} fill={['#f5aaca', '#8fbcf4', '#f6d178', '#b9d5ad'][i % 4]} stroke="#91afcb" />)}
			<rect x={4} y={277} width={292} height={158} rx={22} fill="#efb9cf" />
			<circle cx={105} cy={325} r={33} fill="#fff1f7" stroke="#b47794" strokeWidth={5} />
			<path d="M89 336 121 314" stroke="#b47794" strokeWidth={12} strokeLinecap="round" />
			<rect x={166} y={303} width={65} height={53} rx={20} fill="#594557" />
			<text x={150} y={397} textAnchor="middle" fontFamily="sans-serif" fontSize={14} fill="#23344c">{shape.props.cost ? `${shape.props.cost} puntos` : 'Gratis'} · {shape.props.pool.length} premios</text>
		</g>
	}
	override getIndicatorPath(shape: GachaponShape) { const p = new Path2D(); p.rect(0, 0, shape.props.w, shape.props.h); return p }
}
function Machine({ shape }: { shape: GachaponShape }) {
	const { userId, isTeacher, canUse, pending, results, spin, edit } = useGachapon()
	const editor = useEditor()
	const cursor = useValue('gachapon cursor', () => editor.getCurrentToolId() === 'select', [editor])
	const [prizesOpen, setPrizesOpen] = useState(false)
	const used = !!userId && shape.props.usedUserIds.includes(userId)
	const allowed = !!userId && shape.props.allowedUserIds.includes(userId)
	const spinning = results.some((result) => result.shapeId === shape.id)
	const active = !isTeacher && canUse && cursor && allowed && !used && !spinning && !pending
	const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
	return <HTMLContainer className="gachapon" data-gachapon-id={shape.id} data-spinning={spinning} data-prizes-open={prizesOpen}>
		<div className="gachapon__roof"><span>GACHA<span> XP</span></span>{isTeacher && <button aria-label="Configurar gachapon" onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onClick={() => edit(shape)}>⚙</button>}</div>
		<div className="gachapon__glass" aria-hidden="true"><span className="gachapon__glass-shine" />{Array.from({ length: 13 }, (_, i) => <i className="gachapon__ball" key={i} style={{ left: `${7 + (i * 31) % 72}%`, bottom: `${8 + Math.floor(i / 4) * 18}%`, '--ball-color': ['#f5aaca', '#8fbcf4', '#f6d178', '#b9d5ad'][i % 4], transform: `rotate(${i * 37}deg)` } as CSSProperties} />)}</div>
		<span className="gachapon__price">{shape.props.cost ? `${shape.props.cost.toLocaleString('es-MX')} puntos` : 'Gratis'}</span>
		<div className="gachapon__base">
			<button className="gachapon__knob" aria-label="Girar gachapon" title={shape.props.cost ? `Costo: ${shape.props.cost} puntos` : 'Tirada gratis'} disabled={!active} onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onClick={() => spin(shape)}><span /></button>
			<div className="gachapon__slot" aria-hidden="true" />
			{!isTeacher && <p>{spinning ? 'Preparando el premio…' : used ? 'Ya usaste tu tirada' : !allowed ? 'Espera tu turno' : !canUse ? 'Espera el permiso del maestro' : !cursor ? 'Activa el cursor para girar' : shape.props.cost ? `Girar · ${shape.props.cost.toLocaleString('es-MX')} puntos` : 'Girar · Gratis'}</p>}
			<button className="gachapon__prizes-toggle" aria-label="Ver premios" aria-expanded={prizesOpen} onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onClick={() => setPrizesOpen(!prizesOpen)}><Icon name="eye" size={19} /></button>
		</div>
		<div className="gachapon__prizes" aria-label="Premios de esta máquina">{shape.props.pool.map((id) => { const skin = skins.find((s) => s.id === id)!; return <figure key={id}><img style={{ objectPosition: skin.position }} src={skin.image} alt={skin.name} draggable={false} /></figure> })}</div>
	</HTMLContainer>
}
