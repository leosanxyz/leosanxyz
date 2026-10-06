import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { GACHAPON_DURATION } from '../../shared/gachaponShape'
import type { RewardSkin } from '../../shared/pass'
import type { ShopGrade, ShopPurchase, ShopReview, ShopSpin, ShopState } from '../../shared/shop'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
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
	return hours ? `${hours} h` : `${minutes} min`
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
	// Notices are short and float over the page, so they leave on their own.
	useEffect(() => {
		if (!notice) return
		const timer = setTimeout(() => setNotice(''), 3200)
		return () => clearTimeout(timer)
	}, [notice])
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
			return true
		} catch (cause) { fail(cause, 'No pude comprar la carta.'); return false }
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
	const header = student ? <p className="shop-points" aria-live="polite"><span className="shop-coin" aria-hidden="true" /><strong key={state.points} data-testid="shop-points">{points(state.points)}</strong><span className="xp-sr-only"> puntos</span></p> : null
	return <LibraryShell title="Tienda" view="shop" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/')} actions={header} testId="portal-shop">
		<div className="shop" aria-busy={!state}>
			{loadError && !state && <p className="xp-error shop-alert" role="alert">{loadError} <button className="portal-link" onClick={() => void load()}>Reintentar</button></p>}
			{!state && !loadError && <ShopSkeleton />}
			{state && <>
				{notice && <p className="shop-toast" role="alert" key={notice}>{notice}</p>}
				<section className="shop-hero">
					<div className="shop-machine-frame" ref={machine}><ShopMachine state={state} pending={pending} reveal={reveal} onSpin={(free) => void spin(free)} /></div>
					<Ticket state={state} starting={starting} onReview={() => void startReview()} />
				</section>
				<section className="shop-cards" aria-labelledby="shop-cards-title">
					<div className="shop-cards__heading">
						<h2 id="shop-cards-title">Cartas de hoy</h2>
						<p className="shop-countdown" data-testid="shop-countdown">cambian en {countdown(state.rotatesAt - now)}</p>
					</div>
					<ul className="shop-grid" key={state.day}>
						{state.pool.map((skin, i) => <li key={skin} style={{ '--i': i } as CSSProperties}>
							<ShopCard skin={skin} state={state} onBuy={buy} onShort={(missing) => setNotice(`Te faltan ${points(missing)} puntos`)} />
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
	const free = state.teacher ? <p className="shop-ticket__note">Los alumnos ganan una tirada gratis al repasar 3 preguntas.</p>
		: freeSpin === 'available' ? <span className="shop-free-token"><i aria-hidden="true" />Tirada gratis lista</span>
		: freeSpin === 'used' ? <p className="shop-ticket__note">Tirada gratis usada · mañana hay otra</p>
		: review.active ? <button className="shop-button" onClick={onReview}>Continuar repaso</button>
		: review.attemptsLeft ? <>
			<button className="shop-button" disabled={starting} onClick={onReview}>{starting ? 'Preparando…' : 'Repasar 3 preguntas'}</button>
			<p className="shop-ticket__note">y gira gratis · {review.attemptsLeft === 1 ? '1 intento' : `${review.attemptsLeft} intentos`} hoy</p></>
		: <p className="shop-ticket__note">Sin intentos por hoy</p>
	return <section className="shop-ticket" aria-labelledby="shop-ticket-title">
		<p className="shop-eyebrow">Gachapon</p>
		<h2 id="shop-ticket-title">Una carta al azar</h2>
		<p className="shop-ticket__lead"><span className="shop-coin" aria-hidden="true" /> {points(state.spinCost)} puntos por tirada. {state.teacher ? 'Los alumnos compran aquí con sus puntos.' : 'Nunca sale una que ya tienes.'}</p>
		<div className="shop-ticket__free" data-state={state.teacher ? 'preview' : freeSpin} data-testid="shop-free-spin">{free}</div>
	</section>
}

type CardMode = 'buy' | 'confirm' | 'busy' | 'short' | 'owned' | 'preview'

/** The card is the button: the first tap turns the price into a question, the second buys. */
function ShopCard({ skin, state, onBuy, onShort }: { skin: RewardSkin; state: ShopState; onBuy: (skin: RewardSkin) => Promise<boolean>; onShort: (missing: number) => void }) {
	const art = skins.find((item) => item.id === skin)!
	const owned = state.owned.includes(skin), missing = state.cardCost - state.points
	const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [fresh, setFresh] = useState(false)
	useEffect(() => {
		if (!confirming) return
		const timer = setTimeout(() => setConfirming(false), 4000)
		return () => clearTimeout(timer)
	}, [confirming])
	const mode: CardMode = owned ? 'owned' : state.teacher ? 'preview' : busy ? 'busy' : missing > 0 ? 'short' : confirming ? 'confirm' : 'buy'
	async function press() {
		if (mode === 'short') onShort(missing)
		if (mode === 'buy') setConfirming(true)
		if (mode !== 'confirm') return
		setBusy(true)
		const bought = await onBuy(skin)
		setBusy(false); setConfirming(false); setFresh(bought)
	}
	// The pointer drives the tilt and the sheen through CSS variables, without re-rendering.
	function tilt(event: PointerEvent<HTMLButtonElement>) {
		if (event.pointerType !== 'mouse') return
		const card = event.currentTarget, box = card.getBoundingClientRect()
		const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / (box.width * 1.5)
		card.style.setProperty('--px', Math.min(1, Math.max(0, x)).toFixed(3))
		card.style.setProperty('--py', Math.min(1, Math.max(0, y)).toFixed(3))
	}
	function untilt(event: PointerEvent<HTMLButtonElement>) {
		event.currentTarget.style.removeProperty('--px')
		event.currentTarget.style.removeProperty('--py')
	}
	const price = points(state.cardCost)
	const label = mode === 'owned' ? `${art.name}: ya la tienes` : mode === 'preview' ? `${art.name}, ${price} puntos`
		: mode === 'short' ? `Comprar ${art.name} por ${price} puntos. Te faltan ${points(missing)} puntos`
		: mode === 'buy' ? `Comprar ${art.name} por ${price} puntos` : `Confirmar compra de ${art.name} por ${price} puntos`
	const still = mode === 'owned' || mode === 'preview'
	return <button className="shop-card" data-mode={mode} data-owned={owned} data-fresh={fresh} data-skin={skin} aria-label={label} aria-disabled={still || mode === 'busy' || undefined}
		style={{ '--card-color': art.color } as CSSProperties} onClick={() => void press()} onPointerMove={still ? undefined : tilt} onPointerLeave={untilt}>
		<span className="shop-card__frame">
			<span className="shop-card__art">
				<img src={art.image} style={{ objectPosition: art.position }} alt="" loading="lazy" draggable={false} />
				<span className="shop-card__sheen" />
			</span>
			{!owned && <span className="shop-card__price">{mode === 'confirm' || mode === 'busy' ? `Confirmar · ${price}` : <><span className="shop-coin" />{price}</>}</span>}
			{owned && <span className="shop-card__badge"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
		</span>
		<span className="shop-card__name">{art.name}</span>
	</button>
}

function ShopSkeleton() {
	return <div className="shop-skeleton" role="status" aria-label="Abriendo la tienda">
		<div className="shop-hero"><div className="shop-skeleton__block shop-skeleton__machine" /><div className="shop-skeleton__block shop-skeleton__ticket" /></div>
		<ul className="shop-grid shop-skeleton__grid">{Array.from({ length: 6 }, (_, i) => <li key={i}><div className="shop-skeleton__block shop-skeleton__card" /></li>)}</ul>
	</div>
}
