import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { GACHAPON_DURATION } from '../../shared/gachaponShape'
import { defaultHologram, defaultPass, type PassDraft, type RewardSkin } from '../../shared/pass'
import {
	SHOP_GIFT_STREAK_DAYS, SHOP_GIFT_STREAK_POINTS, SHOP_REVEAL_POINTS,
	type ShopGift, type ShopGiftClaim, type ShopGrade, type ShopPurchase, type ShopReveal, type ShopReview, type ShopSpin, type ShopState,
} from '../../shared/shop'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { GachaponReveal } from '../gachapon/GachaponReveal'
import { loadCelebrate, loadPop, playCelebrate, playCoin, playPop } from '../gachapon/gachaponSounds'
import { navigate } from '../navigation'
import { portalRequest } from '../portal/api'
import { skins } from '../portal/pass/catalog'
import { PassCard } from '../portal/pass/PassCard'
import { usePassReducedMotion } from '../portal/pass/usePassReducedMotion'
import { usePortal } from '../portal/PortalProvider'
import { ReviewSheet } from './ReviewSheet'
import { ShopMachine } from './ShopMachine'
import { fly } from './flight'
import { useShopNotice } from './shopNotice'
import './shop.css'

const unlocked = (userId: string) => window.dispatchEvent(new CustomEvent('xp-skin-unlocked', { detail: { userId } }))
const points = (value: number) => value.toLocaleString('es-MX')
const days = (count: number) => count === 1 ? '1 día' : `${count} días`
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The pass flip in `PassCard`; the burst and the sound land on its midpoint. */
const FLIP_MS = 480

/** The profile's grid foil in full spectrum: on these illustrations it reads better than one hue per card. */
function shopDraft(skin: RewardSkin): PassDraft {
	const art = skins.find((item) => item.id === skin)!
	return { ...defaultPass(art.name, skin), finish: 'prism', hologram: { ...defaultHologram(), hue: 360 } }
}

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
	const [turning, setTurning] = useState<RewardSkin | null>(null), [fresh, setFresh] = useState<RewardSkin[]>([])
	const [claiming, setClaiming] = useState(false)
	const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
	const machine = useRef<HTMLDivElement>(null), pill = useRef<HTMLParagraphElement>(null), coins = useRef<HTMLDivElement>(null)
	const reduced = usePassReducedMotion()
	useEffect(() => { loadPop(); loadCelebrate() }, [])

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
	/** Optimistic: the card turns at once and only turns back if the server says no. */
	async function turnCard(skin: RewardSkin, card: HTMLElement) {
		if (turning || !state || state.revealed.includes(skin)) return
		setTurning(skin); setNotice('')
		setState((current) => current && { ...current, revealed: [...current.revealed, skin] })
		if (!reduced) setFresh((current) => [...current, skin])
		later(() => setTurning(null), reduced ? 0 : FLIP_MS)
		const request = portalRequest<ShopReveal>('shop/reveal', 'POST', { skin })
		const landed = reduced ? (playPop(), Promise.resolve()) : wait(FLIP_MS / 2).then(() => {
			playPop()
			const label = document.createElement('span'), target = pill.current?.getBoundingClientRect()
			label.className = 'shop-flight__points'
			label.textContent = `+${SHOP_REVEAL_POINTS}`
			return target && fly(label, card.getBoundingClientRect(), target, { duration: 700, bend: { x: 0, y: -110 } })
		})
		try {
			const [result] = await Promise.all([request, landed])
			setState((current) => current && { ...current, points: result.points, revealed: [...new Set([...current.revealed, ...result.revealed])] })
		} catch (cause) {
			setState((current) => current && { ...current, revealed: current.revealed.filter((item) => item !== skin) })
			fail(cause, 'No pude revelar la carta.')
		}
	}
	async function claimGift() {
		if (claiming) return
		setClaiming(true); setNotice('')
		try {
			const result = await portalRequest<ShopGiftClaim>('shop/gift', 'POST')
			playCoin()
			if (result.gift.amount === SHOP_GIFT_STREAK_POINTS) playCelebrate()
			setState((current) => current && { ...current, gift: result.gift })
			const from = coins.current?.getBoundingClientRect(), to = pill.current?.getBoundingClientRect()
			if (!reduced && from && to) {
				// The coins fan out of the stack, then curve into the counter one after another.
				const flights = Array.from({ length: 12 }, (_, i) => {
					const coin = document.createElement('span'), angle = -Math.PI / 2 + (i - 5.5) * 0.26, reach = i % 2 ? 150 : 100
					coin.className = 'shop-coin shop-flight__coin'
					return fly(coin, from, to, { duration: 680, delay: i * 38, bend: { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach }, scale: 0.7 })
				})
				await flights[0]
			}
			setState((current) => current && { ...current, points: result.points })
		} catch (cause) { fail(cause, 'No pude abrir el regalo.') }
		finally { setClaiming(false) }
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
	const header = student ? <PointsPill value={state.points} pill={pill} /> : null
	const hidden = state ? state.pool.filter((skin) => !state.revealed.includes(skin)).length : 0
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
						{hidden > 0 && !state.teacher && <p className="shop-cards__hint">Toca una carta para revelarla · +{SHOP_REVEAL_POINTS} puntos</p>}
					</div>
					<div className="shop-shelf">
						<GiftTicket gift={state.gift} teacher={state.teacher} claiming={claiming} coins={coins} onClaim={() => void claimGift()} />
						<ul className="shop-grid" key={state.day}>
							{state.pool.map((skin, i) => <li key={skin} style={{ '--i': i } as CSSProperties}>
								<ShopCard skin={skin} state={state} fresh={fresh.includes(skin)} locked={!!turning && turning !== skin}
									onReveal={(card, element) => void turnCard(card, element)} onBuy={buy} onShort={(missing) => setNotice(`Te faltan ${points(missing)} puntos`)} />
							</li>)}
						</ul>
					</div>
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

/** Counts up to a new total and lets the gain rise above the coin; spending shows at once. */
function PointsPill({ value, pill }: { value: number; pill: RefObject<HTMLParagraphElement | null> }) {
	const reduced = usePassReducedMotion()
	const [shown, setShown] = useState(value), [gain, setGain] = useState<{ amount: number; at: number } | null>(null)
	const target = useRef(value)
	useEffect(() => {
		const from = target.current
		target.current = value
		if (value <= from || reduced) { setShown(value); return }
		setGain({ amount: value - from, at: Date.now() })
		const start = performance.now()
		let frame = 0
		const step = (time: number) => {
			const t = Math.min(1, (time - start) / 520)
			setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3)))
			if (t < 1) frame = requestAnimationFrame(step)
		}
		frame = requestAnimationFrame(step)
		return () => { cancelAnimationFrame(frame); setShown(value) }
	}, [value, reduced])
	return <p className="shop-points" ref={pill} aria-live="polite">
		<span className="shop-coin" aria-hidden="true" /><strong key={value} data-testid="shop-points">{points(shown)}</strong><span className="xp-sr-only"> puntos</span>
		{gain && !reduced && <span className="shop-points__gain" key={gain.at} aria-hidden="true">+{points(gain.amount)}</span>}
	</p>
}

/** A gold ticket for showing up. Five days in a row pay more, every day while the streak holds. */
function GiftTicket({ gift, teacher, claiming, coins, onClaim }: { gift: ShopGift; teacher: boolean; claiming: boolean; coins: RefObject<HTMLDivElement | null>; onClaim: () => void }) {
	const past = gift.claimed ? gift.streak - 1 : gift.streak
	const today = Math.min(Math.max(past, 0), SHOP_GIFT_STREAK_DAYS - 1)
	const streak = teacher ? 'Un regalo al día' : gift.claimed || past ? `Racha · ${days(gift.claimed ? gift.streak : past)}` : 'Empieza tu racha'
	const cell = (i: number) => teacher ? 'next' : i < today || (i === today && gift.claimed) ? 'done' : i === today ? 'today' : 'next'
	return <div className="shop-gift-slot">
		<section className="shop-gift" data-claimed={gift.claimed} data-testid="shop-gift" aria-labelledby="shop-gift-title">
			<p className="shop-gift__eyebrow" id="shop-gift-title">Regalo diario</p>
			<div className="shop-gift__coins" ref={coins} aria-hidden="true"><i /><i /><i /><i /></div>
			<p className="shop-gift__amount">+{points(gift.amount)}<span className="xp-sr-only"> puntos</span></p>
			<div className="shop-gift__streak">
				<ol aria-hidden="true">{Array.from({ length: SHOP_GIFT_STREAK_DAYS }, (_, i) => <li key={i} data-state={cell(i)} />)}</ol>
				<p>{streak}</p>
			</div>
			{gift.claimed ? <p className="shop-gift__done">{teacher ? 'Vista previa' : 'Reclamado · mañana hay otro'}</p>
				: <button className="shop-gift__claim" disabled={claiming} onClick={onClaim}>Reclamar</button>}
		</section>
		<p className="shop-card__name">{SHOP_GIFT_STREAK_DAYS} días seguidos: +{SHOP_GIFT_STREAK_POINTS} diarios</p>
	</div>
}

type CardMode = 'reveal' | 'buy' | 'confirm' | 'busy' | 'short' | 'owned' | 'preview'

const CARD_BACK = <div className="shop-card-back"><span className="shop-card-back__emblem">XP</span><span className="shop-card-back__ribbon">Nuevo</span></div>
const BURST = Array.from({ length: 12 }, (_, i) => {
	const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.2, reach = i % 3 ? 120 : 90
	return { '--dx': `${Math.cos(angle) * reach}px`, '--dy': `${Math.sin(angle) * reach}px`, '--spin': `${(i % 2 ? 1 : -1) * (180 + i * 30)}deg` } as CSSProperties
})

/**
 * The profile card in its shop dress, with the same tilt, lamp and foil. Face down it is a "Revelar carta" button;
 * face up, the first tap turns the price into a question and the second buys.
 */
function ShopCard({ skin, state, fresh, locked, onReveal, onBuy, onShort }: {
	skin: RewardSkin; state: ShopState; fresh: boolean; locked: boolean
	onReveal: (skin: RewardSkin, card: HTMLElement) => void; onBuy: (skin: RewardSkin) => Promise<boolean>; onShort: (missing: number) => void
}) {
	const art = skins.find((item) => item.id === skin)!
	const draft = useMemo(() => shopDraft(skin), [skin])
	const revealed = state.revealed.includes(skin), owned = state.owned.includes(skin), missing = state.cardCost - state.points
	const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [bought, setBought] = useState(false)
	const stage = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null)
	useEffect(() => {
		if (!confirming) return
		const timer = setTimeout(() => setConfirming(false), 4000)
		return () => clearTimeout(timer)
	}, [confirming])
	const mode: CardMode = !revealed ? 'reveal' : owned ? 'owned' : state.teacher ? 'preview' : busy ? 'busy' : missing > 0 ? 'short' : confirming ? 'confirm' : 'buy'
	/** Waits for the card to accept focus again, unless the student moved on. */
	function refocus(delay: number, tries: number) {
		setTimeout(() => {
			if (document.activeElement !== document.body) return
			button.current?.focus({ preventScroll: true })
			if (document.activeElement !== button.current && tries) refocus(100, tries - 1)
		}, delay)
	}
	async function press() {
		if (mode === 'reveal') {
			if (locked) return
			// The overlay is inert while the card turns, so a keyboard reveal gets its focus back afterwards.
			const focused = document.activeElement === button.current
			onReveal(skin, stage.current!)
			if (focused) refocus(FLIP_MS, 12)
			return
		}
		if (mode === 'short') onShort(missing)
		if (mode === 'buy') setConfirming(true)
		if (mode !== 'confirm') return
		setBusy(true)
		const success = await onBuy(skin)
		setBusy(false); setConfirming(false); setBought(success)
	}
	const price = points(state.cardCost)
	const label = mode === 'reveal' ? 'Revelar carta' : mode === 'owned' ? `${art.name}: ya la tienes` : mode === 'preview' ? `${art.name}, ${price} puntos`
		: mode === 'short' ? `Comprar ${art.name} por ${price} puntos. Te faltan ${points(missing)} puntos`
		: mode === 'buy' ? `Comprar ${art.name} por ${price} puntos` : `Confirmar compra de ${art.name} por ${price} puntos`
	const still = mode === 'owned' || mode === 'preview'
	const actions = <button ref={button} className="shop-card" data-mode={mode} data-owned={owned} data-bought={bought} data-skin={skin} aria-label={label}
		aria-disabled={still || mode === 'busy' || (mode === 'reveal' && locked) || undefined} onClick={() => void press()}>
		{revealed && !owned && <span className="shop-card__price">{mode === 'confirm' || mode === 'busy' ? `Confirmar · ${price}` : <><span className="shop-coin" />{price}</>}</span>}
		{revealed && owned && <span className="shop-card__badge"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
	</button>
	return <div className="shop-card-slot" data-revealed={revealed} data-owned={revealed && owned} data-mode={mode} style={{ '--card-color': art.color } as CSSProperties}>
		<div className="shop-card-stage" ref={stage}>
			<PassCard draft={draft} variant="shop" back={!revealed} backFace={CARD_BACK} actions={actions} />
			{fresh && <span className="shop-burst" aria-hidden="true"><b />{BURST.map((style, i) => <i key={i} style={style} />)}</span>}
		</div>
		<p className="shop-card__name">{revealed ? art.name : 'Carta nueva'}</p>
	</div>
}

function ShopSkeleton() {
	return <div className="shop-skeleton" role="status" aria-label="Abriendo la tienda">
		<div className="shop-hero"><div className="shop-skeleton__block shop-skeleton__machine" /><div className="shop-skeleton__block shop-skeleton__ticket" /></div>
		<ul className="shop-grid shop-skeleton__grid">{Array.from({ length: 6 }, (_, i) => <li key={i}><div className="shop-skeleton__block shop-skeleton__card" /></li>)}</ul>
	</div>
}
