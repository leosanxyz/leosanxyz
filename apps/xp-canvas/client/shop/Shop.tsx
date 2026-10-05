import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { GACHAPON_DURATION } from '../../shared/gachaponShape'
import { REWARD_SKIN_SETS, type RewardSkin } from '../../shared/pass'
import type { ShopGrade, ShopPurchase, ShopReview, ShopSpin, ShopState } from '../../shared/shop'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { Icon } from '../components/Icon'
import { GachaponReveal } from '../gachapon/GachaponReveal'
import { playCoin } from '../gachapon/gachaponSounds'
import { navigate } from '../navigation'
import { portalRequest } from '../portal/api'
import { skins } from '../portal/pass/catalog'
import { usePortal } from '../portal/PortalProvider'
import { ReviewSheet } from './ReviewSheet'
import { ShopMachine } from './ShopMachine'
import { useShopNotice } from './shopNotice'
import './shop.css'

const unlocked = (userId: string) => window.dispatchEvent(new CustomEvent('xp-skin-unlocked', { detail: { userId } }))
const points = (value: number) => value.toLocaleString('es-MX')

function countdown(ms: number) {
	const minutes = Math.max(1, Math.ceil(ms / 60_000)), hours = Math.floor(minutes / 60)
	return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`
}

export default function Shop() {
	const { user } = usePortal()
	const { library } = useBoardLibrary()
	const { markSeen } = useShopNotice(user?.role === 'student' ? user.id : undefined)
	const [state, setState] = useState<ShopState | null>(null), [loadError, setLoadError] = useState('')
	const [notice, setNotice] = useState('')
	const [pending, setPending] = useState(false), [reveal, setReveal] = useState<ShopSpin | null>(null)
	const [sheet, setSheet] = useState<ShopReview | null>(null), [starting, setStarting] = useState(false)
	const [now, setNow] = useState(Date.now)
	const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
	const machine = useRef<HTMLDivElement>(null)

	const load = useCallback(async () => {
		try {
			setState(await portalRequest<ShopState>('shop'))
			setLoadError('')
		} catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'No pude abrir la tienda.') }
	}, [])
	useEffect(() => {
		void load()
		const check = () => { if (!document.hidden) void load() }
		window.addEventListener('focus', check)
		document.addEventListener('visibilitychange', check)
		const tick = window.setInterval(() => setNow(Date.now()), 15_000)
		const scheduled = timers.current
		return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); clearInterval(tick); for (const timer of scheduled) clearTimeout(timer) }
	}, [load])
	// Opening the shop clears the dot, also when a new day arrives while it is open.
	useEffect(() => { if (state) markSeen() }, [state?.day, markSeen])
	const rolled = !!state && now >= state.rotatesAt
	useEffect(() => { if (rolled) void load() }, [rolled, load])

	function later(callback: () => void, delay: number) {
		const timer = setTimeout(() => { timers.current.delete(timer); callback() }, delay)
		timers.current.add(timer)
	}
	const fail = (cause: unknown, fallback: string) => { setNotice(cause instanceof Error ? cause.message : fallback); void load() }

	async function spin(free: boolean) {
		if (pending || reveal) return
		setPending(true); setNotice('')
		try {
			const result = await portalRequest<ShopSpin>('shop/spin', 'POST', { spinId: crypto.randomUUID(), free })
			setReveal(result)
			setState((current) => current && { ...current, points: result.points })
			unlocked(result.userId)
			// The card joins the collection once the reveal ends, so the grid does not spoil it.
			later(() => { setReveal(null); void load() }, Math.max(0, result.startedAt + GACHAPON_DURATION - Date.now()))
		} catch (cause) { fail(cause, 'No pude girar la máquina.') }
		finally { setPending(false) }
	}
	async function buy(skin: RewardSkin) {
		setNotice('')
		try {
			const result = await portalRequest<ShopPurchase>('shop/buy', 'POST', { skin })
			playCoin()
			setState((current) => current && { ...current, points: result.points, owned: [...current.owned, result.skin] })
			if (user) unlocked(user.id)
		} catch (cause) { fail(cause, 'No pude comprar la carta.') }
	}
	async function startReview() {
		if (state?.review.active) { setSheet(state.review.active); return }
		setStarting(true); setNotice('')
		try {
			const review = await portalRequest<ShopReview>('shop/review', 'POST')
			setState((current) => current && { ...current, review: { ...current.review, active: review } })
			setSheet(review)
		} catch (cause) { fail(cause, 'No pude preparar el repaso.') }
		finally { setStarting(false) }
	}
	async function grade(answers: number[]) {
		const result = await portalRequest<ShopGrade>(`shop/review/${sheet!.id}`, 'POST', { answers })
		setState((current) => current && { ...current, freeSpin: result.freeSpin, review: { attemptsLeft: result.attemptsLeft, active: null } })
		return result
	}
	async function retry() {
		const review = await portalRequest<ShopReview>('shop/review', 'POST')
		setState((current) => current && { ...current, review: { ...current.review, active: review } })
		setSheet(review)
	}
	function goToMachine() {
		setSheet(null)
		machine.current?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
		// Radix returns focus to the trigger first; the lever is the next useful step.
		later(() => machine.current?.querySelector<HTMLButtonElement>('.gachapon__lever:enabled, .gachapon__knob:enabled')?.focus({ preventScroll: true }), 60)
	}

	const student = state && !state.teacher
	const header = student ? <p className="shop-points" aria-live="polite"><span className="shop-coin" aria-hidden="true" /><strong key={state.points} data-testid="shop-points">{points(state.points)}</strong><span className="shop-points__label">puntos</span></p> : null
	return <LibraryShell title="Tienda" view="shop" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/')} actions={header} testId="portal-shop">
		<div className="shop" aria-busy={!state}>
			{loadError && !state && <p className="xp-error shop-alert" role="alert">{loadError} <button className="portal-link" onClick={() => void load()}>Reintentar</button></p>}
			{!state && !loadError && <ShopSkeleton />}
			{state && <>
				{notice && <p className="xp-error shop-alert" role="alert">{notice}</p>}
				<section className="shop-hero">
					<div className="shop-machine-frame" ref={machine}><ShopMachine state={state} pending={pending} reveal={reveal} onSpin={(free) => void spin(free)} /></div>
					<Ticket state={state} starting={starting} onReview={() => void startReview()} />
				</section>
				<section className="shop-cards" aria-labelledby="shop-cards-title">
					<div className="shop-cards__heading">
						<h2 id="shop-cards-title">Cartas de hoy</h2>
						<p className="shop-countdown" data-testid="shop-countdown"><Icon name="recent" size={17} />Nuevas cartas en {countdown(state.rotatesAt - now)}</p>
					</div>
					<ul className="shop-grid" key={state.day}>
						{state.pool.map((skin, i) => <li key={skin} style={{ '--i': i } as CSSProperties}>
							<ShopCard skin={skin} state={state} onBuy={buy} />
						</li>)}
					</ul>
				</section>
			</>}
		</div>
		{reveal && <GachaponReveal result={reveal} />}
		{sheet && <ReviewSheet review={sheet} onGrade={grade} onRetry={retry} onGoToMachine={goToMachine} onClose={() => setSheet(null)} />}
	</LibraryShell>
}

function Ticket({ state, starting, onReview }: { state: ShopState; starting: boolean; onReview: () => void }) {
	const { freeSpin, review } = state
	const free = state.teacher ? <><strong>Tirada gratis</strong><span>Los alumnos la ganan respondiendo bien 3 preguntas de sus clases.</span></>
		: freeSpin === 'available' ? <><span className="shop-free-token"><i aria-hidden="true" />1 tirada gratis lista</span><span>Jala la palanca de la máquina.</span></>
		: freeSpin === 'used' ? <><strong>Tirada gratis usada</strong><span>Mañana hay otra.</span></>
		: review.active ? <><strong>Tirada gratis</strong><span>Tienes un repaso a medias.</span><button className="shop-button" onClick={onReview}>Continuar repaso</button></>
		: review.attemptsLeft ? <><strong>Tirada gratis</strong><span>Responde bien 3 preguntas de tus clases.</span>
			<button className="shop-button" disabled={starting} onClick={onReview}>{starting ? 'Preparando…' : 'Repasar ahora'}</button>
			<small>{review.attemptsLeft === 1 ? 'Te queda 1 intento hoy' : `${review.attemptsLeft} intentos hoy`}</small></>
		: <><strong>Sin intentos por hoy</strong><span>Mañana hay otra oportunidad.</span></>
	return <section className="shop-ticket" aria-labelledby="shop-ticket-title">
		<p className="shop-eyebrow">Gachapon</p>
		<h2 id="shop-ticket-title">Una carta al azar de las de hoy</h2>
		<p className="shop-ticket__lead">{state.teacher ? 'Los alumnos compran aquí con sus puntos.' : 'Nunca sale una carta que ya tienes.'}</p>
		<div className="shop-ticket__options">
			<div className="shop-option"><strong className="shop-price"><span className="shop-coin" aria-hidden="true" />{points(state.spinCost)}</strong><span>puntos por tirada</span></div>
			<div className="shop-option shop-option--free" data-state={state.teacher ? 'preview' : freeSpin} data-testid="shop-free-spin">{free}</div>
		</div>
	</section>
}

function ShopCard({ skin, state, onBuy }: { skin: RewardSkin; state: ShopState; onBuy: (skin: RewardSkin) => Promise<void> }) {
	const art = skins.find((item) => item.id === skin)!
	const owned = state.owned.includes(skin), missing = state.cardCost - state.points
	const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false)
	useEffect(() => {
		if (!confirming) return
		const timer = setTimeout(() => setConfirming(false), 4000)
		return () => clearTimeout(timer)
	}, [confirming])
	async function press() {
		if (!confirming) { setConfirming(true); return }
		setBusy(true)
		await onBuy(skin)
		setBusy(false); setConfirming(false)
	}
	const set = REWARD_SKIN_SETS[0].includes(skin as (typeof REWARD_SKIN_SETS)[0][number]) ? 1 : 2
	const price = points(state.cardCost)
	const label = owned ? 'Ya la tienes' : state.teacher ? `${price} puntos` : missing > 0 ? `Te faltan ${points(missing)}` : busy ? 'Comprando…' : confirming ? `Confirmar · ${price}` : price
	return <article className="shop-card" data-owned={owned} data-skin={skin} style={{ '--card-color': art.color } as CSSProperties}>
		<div className="shop-card__art">
			<img src={art.image} style={{ objectPosition: art.position }} alt="" loading="lazy" draggable={false} />
			{owned && <span className="shop-card__stamp">Tuya</span>}
		</div>
		<div className="shop-card__body">
			<h3>{art.name}</h3>
			<p>Gachapon · Set {set}</p>
			<button className="shop-card__buy" data-confirm={confirming} disabled={owned || state.teacher || missing > 0 || busy}
				aria-label={owned ? `${art.name}: ya la tienes` : confirming ? `Confirmar compra de ${art.name} por ${price} puntos` : `Comprar ${art.name} por ${price} puntos`}
				onClick={() => void press()}>{!owned && !confirming && missing <= 0 && !state.teacher && <span className="shop-coin" aria-hidden="true" />}{label}</button>
		</div>
	</article>
}

function ShopSkeleton() {
	return <div className="shop-skeleton" role="status" aria-label="Abriendo la tienda">
		<div className="shop-hero"><div className="shop-skeleton__block shop-skeleton__machine" /><div className="shop-skeleton__block shop-skeleton__ticket" /></div>
		<ul className="shop-grid">{Array.from({ length: 6 }, (_, i) => <li key={i}><div className="shop-skeleton__block shop-skeleton__card" /></li>)}</ul>
	</div>
}
