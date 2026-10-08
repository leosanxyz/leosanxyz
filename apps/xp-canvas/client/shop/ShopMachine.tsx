import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { GachaponResult } from '../../shared/gachaponShape'
import type { ShopState } from '../../shared/shop'
import { skins } from '../portal/pass/catalog'
import { playCoin, prepareGachaponAudio } from '../gachapon/gachaponSounds'
import { useMachine3D } from '../gachapon/useMachine3D'
import '../gachapon/gachapon.css'

/** The canvas gachapon outside tldraw. `data-gachapon-id="shop"` lets the reveal fly out of its slot. */
export function ShopMachine({ state, pending, reveal, onSpin }: { state: ShopState; pending: boolean; reveal: GachaponResult | null; onSpin: (free: boolean) => void }) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const [coinAt, setCoinAt] = useState<number | null>(null)
	const free = state.freeSpin === 'available'
	const complete = state.pool.every((skin) => state.owned.includes(skin))
	const missing = state.spinCost - state.points
	const spinning = !!reveal
	const ready = !state.teacher && !spinning && !pending && !complete && (free || missing <= 0)
	const needsCoin = !free && coinAt === null
	const cost = state.spinCost.toLocaleString('es-MX')
	const status3d = useMachine3D(canvas, {
		spinStartedAt: reveal?.startedAt ?? null, coinAt, cost: free ? 0 : state.spinCost, width: 300, height: 440,
		prizeColor: skins.find((skin) => skin.id === reveal?.skin)?.color ?? '#ffb347', sway: false,
	})
	useEffect(() => { prepareGachaponAudio() }, [])
	// The coin is spent when the spin starts and returned if the student can no longer spin.
	useEffect(() => { if (coinAt !== null && !ready && !pending) setCoinAt(null) }, [coinAt, ready, pending])
	const status = state.teacher ? 'Vista previa' : spinning ? 'Preparando el premio…' : pending ? 'Girando…' : complete ? 'Ya tienes todas las cartas de hoy'
		: free ? 'Tirada gratis lista' : missing > 0 ? '' : needsCoin ? `Inserta una moneda de ${cost} puntos` : 'Jala la palanca'
	// The glowing coin and lever, or the ticket for a free spin, already say what to do; words show only when something is different.
	// Short of points, the machine says nothing: the balance in the header already does.
	const quiet = ready || pending || spinning || !status

	if (status3d === 'failed') {
		// CSS machine without WebGL: one knob spins, free or paid.
		return <div className="gachapon shop-machine" data-gachapon-id="shop" data-spinning={spinning}>
			<div className="gachapon__roof"><span>GACHA<span> XP</span></span></div>
			<div className="gachapon__glass" aria-hidden="true"><span className="gachapon__glass-shine" />{Array.from({ length: 13 }, (_, i) => <i className="gachapon__ball" key={i} style={{ left: `${7 + (i * 31) % 72}%`, bottom: `${8 + Math.floor(i / 4) * 18}%`, '--ball-color': ['#f5aaca', '#8fbcf4', '#f6d178', '#b9d5ad'][i % 4], transform: `rotate(${i * 37}deg)` } as CSSProperties} />)}</div>
			<span className="gachapon__price">{free ? 'Gratis' : `${cost} puntos`}</span>
			<div className="gachapon__base">
				<button className="gachapon__knob" aria-label="Girar gachapon" disabled={!ready} onClick={() => onSpin(free)}><span /></button>
				<div className="gachapon__slot" aria-hidden="true" />
				<p role="status" className={quiet ? 'xp-sr-only' : undefined} data-testid="shop-machine-status">{status}</p>
			</div>
		</div>
	}

	return <div className="gachapon shop-machine" data-gachapon-id="shop" data-spinning={spinning} data-three={status3d}>
		<canvas ref={canvas} className="gachapon__canvas" aria-hidden="true" />
		<p className={quiet ? 'xp-sr-only' : 'gachapon__status'} role="status" data-testid="shop-machine-status">{status}</p>
		{!free && <button className="gachapon__coin" aria-label={needsCoin ? `Insertar moneda de ${cost} puntos` : 'Moneda insertada'} aria-pressed={!needsCoin}
			title={`Costo: ${cost} puntos`} disabled={!ready || !needsCoin} onClick={() => { setCoinAt(Date.now()); playCoin() }} />}
		<button className="gachapon__lever" aria-label={free ? 'Girar gachapon gratis' : 'Girar gachapon'} title="Jalar la palanca" disabled={!ready || needsCoin} onClick={() => onSpin(free)} />
		<div className="gachapon__slot" aria-hidden="true" />
	</div>
}
