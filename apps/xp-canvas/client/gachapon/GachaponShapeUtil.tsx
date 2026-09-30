import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor, useValue } from 'tldraw'
import { gachaponShapeProps, gachaponShapeMigrations, type GachaponShape } from '../../shared/gachaponShape'
import { REWARD_SKIN_SETS } from '../../shared/pass'
import { skins } from '../portal/pass/catalog'
import { Icon } from '../components/Icon'
import { useGachapon } from './GachaponContext'
import { playCoin, prepareGachaponAudio } from './gachaponSounds'
import { useMachine3D } from './useMachine3D'
import './gachapon.css'

const CAPSULE_COLORS = ['#ffb347', '#6fb7ff', '#e58ae8', '#8fd66b', '#f3e2cc', '#ff8fb8']

export class GachaponShapeUtil extends BaseBoxShapeUtil<GachaponShape> {
	static override type = 'gachapon' as const
	static override props = gachaponShapeProps
	static override migrations = gachaponShapeMigrations
	override getDefaultProps(): GachaponShape['props'] { return { cost: 0, w: 300, h: 440, pool: [...REWARD_SKIN_SETS[0]], allowedUserIds: [], usedUserIds: [], revision: crypto.randomUUID() } }
	override canEdit() { return false }
	override canResize() { return false }
	override getText() { return 'Gachapon' }
	override component(shape: GachaponShape) { return <Machine shape={shape} /> }
	override toSvg(shape: GachaponShape) {
		return <g>
			<ellipse cx={150} cy={420} rx={125} ry={12} fill="#5c2a1e22" />
			<rect x={40} y={110} width={220} height={300} rx={26} fill="#ff8a6e" />
			<rect x={26} y={52} width={248} height={92} rx={34} fill="#ff977e" />
			<rect x={52} y={40} width={50} height={34} rx={14} fill="#ff977e" transform="rotate(-14 77 57)" />
			<rect x={198} y={40} width={50} height={34} rx={14} fill="#ff977e" transform="rotate(14 223 57)" />
			<circle cx={150} cy={98} r={34} fill="#ff8a6e" stroke="#e9694f" strokeWidth={5} />
			<text x={150} y={110} textAnchor="middle" fontFamily="sans-serif" fontWeight={900} fontSize={30} fill="#ffc54a" stroke="#8a3a2c" strokeWidth={1.5}>XP</text>
			<rect x={62} y={152} width={176} height={160} rx={10} fill="#ffc9b6" stroke="#e9694f" strokeWidth={3} />
			{Array.from({ length: 11 }, (_, i) => <circle key={i} cx={88 + (i % 5) * 31 + (i > 4 ? 15 : 0)} cy={290 - Math.floor(i / 5) * 42} r={21} fill={CAPSULE_COLORS[i % CAPSULE_COLORS.length]} stroke="#ffffff99" strokeWidth={3} />)}
			{shape.props.cost > 0 && <rect x={70} y={336} width={66} height={48} rx={10} fill="#ffe2a8" />}
			{shape.props.cost > 0 && <rect x={84} y={342} width={38} height={20} rx={8} fill="#ffc54a" />}
			<rect x={164} y={336} width={60} height={46} rx={10} fill="#e9694f" />
			<rect x={172} y={344} width={44} height={30} rx={8} fill="#6b3b35" />
			<line x1={270} y1={350} x2={270} y2={300} stroke="#ffb13d" strokeWidth={8} strokeLinecap="round" />
			<circle cx={270} cy={296} r={13} fill="#ff9a3c" />
		</g>
	}
	override getIndicatorPath(shape: GachaponShape) { const p = new Path2D(); p.rect(0, 0, shape.props.w, shape.props.h); return p }
}

function Machine({ shape }: { shape: GachaponShape }) {
	const { userId, isTeacher, canUse, pending, results, spin, edit } = useGachapon()
	const editor = useEditor()
	const cursor = useValue('gachapon cursor', () => editor.getCurrentToolId() === 'select', [editor])
	const [prizesOpen, setPrizesOpen] = useState(false)
	const [coinAt, setCoinAt] = useState<number | null>(null)
	const canvas = useRef<HTMLCanvasElement>(null)
	const used = !!userId && shape.props.usedUserIds.includes(userId)
	const allowed = !!userId && shape.props.allowedUserIds.includes(userId)
	const spinResult = results.find((result) => result.shapeId === shape.id)
	const spinning = !!spinResult
	const ready = !isTeacher && canUse && cursor && allowed && !used && !spinning && !pending
	const paid = shape.props.cost > 0
	const needsCoin = paid && coinAt === null
	const cost = shape.props.cost.toLocaleString('es-MX')
	const status3d = useMachine3D(canvas, {
		spinStartedAt: spinResult?.startedAt ?? null, coinAt, cost: shape.props.cost, width: shape.props.w, height: shape.props.h,
		prizeColor: skins.find((skin) => skin.id === spinResult?.skin)?.color ?? CAPSULE_COLORS[0],
	})
	useEffect(() => { prepareGachaponAudio() }, [])
	// The coin is spent when the spin starts and returned if the student can no longer spin.
	useEffect(() => { if (coinAt !== null && !ready && !pending) setCoinAt(null) }, [coinAt, ready, pending])
	const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
	const guard = { onPointerDown: stop, onTouchStart: stop, onTouchEnd: stop }
	const status = spinning ? 'Preparando el premio…' : used ? 'Ya usaste tu tirada' : !allowed ? 'Espera tu turno' : !canUse ? 'Espera el permiso del maestro'
		: !cursor ? 'Activa el cursor para girar' : needsCoin ? `Inserta una moneda · ${cost} puntos` : 'Jala la palanca'
	const prizes = <>
		<button className="gachapon__prizes-toggle" aria-label="Ver premios" aria-expanded={prizesOpen} {...guard} onClick={() => setPrizesOpen(!prizesOpen)}><Icon name="eye" size={19} /></button>
		<div className="gachapon__prizes" aria-label="Premios de esta máquina">{shape.props.pool.map((id) => { const skin = skins.find((s) => s.id === id)!; return <figure key={id}><img style={{ objectPosition: skin.position }} src={skin.image} alt={skin.name} loading="lazy" draggable={false} /></figure> })}</div>
	</>

	if (status3d === 'failed') {
		// CSS machine without WebGL: one knob spins, paid or free.
		const active = !isTeacher && canUse && cursor && allowed && !used && !spinning && !pending
		return <HTMLContainer className="gachapon" data-gachapon-id={shape.id} data-spinning={spinning} data-prizes-open={prizesOpen}>
			<div className="gachapon__roof"><span>GACHA<span> XP</span></span>{isTeacher && <button aria-label="Configurar gachapon" {...guard} onClick={() => edit(shape)}>⚙</button>}</div>
			<div className="gachapon__glass" aria-hidden="true"><span className="gachapon__glass-shine" />{Array.from({ length: 13 }, (_, i) => <i className="gachapon__ball" key={i} style={{ left: `${7 + (i * 31) % 72}%`, bottom: `${8 + Math.floor(i / 4) * 18}%`, '--ball-color': ['#f5aaca', '#8fbcf4', '#f6d178', '#b9d5ad'][i % 4], transform: `rotate(${i * 37}deg)` } as CSSProperties} />)}</div>
			<span className="gachapon__price">{paid ? `${cost} puntos` : 'Gratis'}</span>
			<div className="gachapon__base">
				<button className="gachapon__knob" aria-label="Girar gachapon" title={paid ? `Costo: ${shape.props.cost} puntos` : 'Tirada gratis'} disabled={!active} {...guard} onClick={() => spin(shape)}><span /></button>
				<div className="gachapon__slot" aria-hidden="true" />
				{!isTeacher && <p>{spinning ? 'Preparando el premio…' : used ? 'Ya usaste tu tirada' : !allowed ? 'Espera tu turno' : !canUse ? 'Espera el permiso del maestro' : !cursor ? 'Activa el cursor para girar' : paid ? `Girar · ${cost} puntos` : 'Girar · Gratis'}</p>}
				{prizes}
			</div>
		</HTMLContainer>
	}

	return <HTMLContainer className="gachapon" data-gachapon-id={shape.id} data-spinning={spinning} data-prizes-open={prizesOpen} data-three={status3d}>
		<canvas ref={canvas} className="gachapon__canvas" aria-hidden="true" />
		{isTeacher && <button className="gachapon__settings" aria-label="Configurar gachapon" {...guard} onClick={() => edit(shape)}>⚙</button>}
		{!isTeacher && <p className="gachapon__status">{status}</p>}
		{paid && <button className="gachapon__coin" aria-label={needsCoin ? `Insertar moneda de ${cost} puntos` : 'Moneda insertada'} aria-pressed={!needsCoin}
			title={`Costo: ${cost} puntos`} disabled={!ready || !needsCoin} {...guard} onClick={() => { setCoinAt(Date.now()); playCoin() }} />}
		<button className="gachapon__lever" aria-label="Girar gachapon" title="Jalar la palanca" disabled={!ready || needsCoin} {...guard} onClick={() => spin(shape)} />
		<div className="gachapon__slot" aria-hidden="true" />
		{prizes}
	</HTMLContainer>
}
