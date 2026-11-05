import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, cubicBezier, motion, usePresence } from 'motion/react'
import cardBack from '../../design/shop/web/card-back.webp'
import { GACHAPON_DURATION } from '../../shared/gachaponShape'
import type { CosmeticPurchase } from '../../shared/cosmetics'
import { isRewardSkin } from '../../shared/pass'
import {
	SHOP_GIFT_STREAK_DAYS, SHOP_GIFT_STREAK_POINTS, SHOP_REVEAL_POINTS,
	type ShopAnswer, type ShopGift, type ShopGiftClaim, type ShopPrize, type ShopPurchase, type ShopReveal, type ShopReview, type ShopSpin, type ShopState,
} from '../../shared/shop'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { Icon } from '../components/Icon'
import { PageSkeleton, ShopShape } from '../components/Skeleton'
import { CARD } from './layout'
import { GachaponReveal } from '../gachapon/GachaponReveal'
import { loadCelebrate, loadPop, playCelebrate, playCoin, playPop } from '../gachapon/gachaponSounds'
import { navigate } from '../navigation'
import { Celebration } from '../questions/QuestionCelebrations'
import { loadQuestionSounds, playCorrect, playIncorrect } from '../questions/useQuestionSounds'
import { portalRequest } from '../portal/api'
import { PassCard } from '../portal/pass/PassCard'
import { usePassReducedMotion } from '../portal/pass/usePassReducedMotion'
import { usePortal } from '../portal/PortalProvider'
import { uuid } from '../uuid'
import { ShopMachine } from './ShopMachine'
import { hasPrize, prizeColor, prizeDraft, prizeItem, prizeName, prizePrice, PrizeCaption, PrizeCover, PrizeFace, RarityChip } from './Prize'
import { COINS_FLY_AT, flyCoins } from './coins'
import { useShopNotice } from './shopNotice'
import './shop.css'

const unlocked = (userId: string) => window.dispatchEvent(new CustomEvent('xp-skin-unlocked', { detail: { userId } }))
const points = (value: number) => value.toLocaleString('es-MX')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The pass flip in `PassCard`; the flash, the sound and the coins start on its midpoint. */
const FLIP_MS = 480

/** Where a card sits: the machine's strip or one of the rows. The same cosmetic can be in the machine and in a row at once. */
type Place = 'machine' | 'cards' | 'effects' | 'plates'
type Open = { prize: ShopPrize; place: Place }
const openKey = ({ place, prize }: Open) => `${place}/${prize}`
const ROWS = [
	{ place: 'cards', title: 'Cartas en venta', items: (state: ShopState) => state.shop },
	{ place: 'effects', title: 'Efectos de carta', items: (state: ShopState) => state.effects },
	{ place: 'plates', title: 'Placas', items: (state: ShopState) => state.plates },
] as const

/** The strip's cards gather into the tray and spread back as one motion. */
const GATHER = { type: 'spring', duration: 0.5, bounce: 0 } as const
/** Card widths in px. The corners scale with the card, 17 px at the row's 196 px, so a card keeps its look at every size and through every morph. */
const radius = (width: number) => Math.round(width * 17 / 196)
/** A scrolled strip's slide back to its start before the cards gather. */
const REWIND_MS = 180, REWIND_EASE = cubicBezier(.19, 1, .22, 1)

/** `hh:mm` until the next rotation, ticking every second. */
function Countdown({ at }: { at: number }) {
	const [now, setNow] = useState(Date.now)
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [])
	const ms = Math.max(0, at - now)
	return <span data-testid="shop-countdown">{String(Math.floor(ms / 3_600_000)).padStart(2, '0') + ':' + String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}</span>
}

export default function Shop() {
	const { user } = usePortal()
	const { library } = useBoardLibrary()
	const { markSeen } = useShopNotice(user?.role === 'student' ? user.id : undefined)
	const [state, setState] = useState<ShopState | null>(null), [loadError, setLoadError] = useState('')
	const [machineReady] = useState(() => {
		let resolve = () => {}
		const promise = new Promise<void>((done) => { resolve = done })
		return { promise, resolve }
	})
	// The shop waits hidden behind its skeleton until the 3D machine is built, since building it blocks the page
	// for a moment. Then the skeleton fades out and the shop fades in after it, so the two never overlap.
	const [entrance, setEntrance] = useState<'hidden' | 'in' | 'done'>('hidden')
	const machineBuilt = useCallback(() => setEntrance((current) => current === 'hidden' ? 'in' : current), [])
	useEffect(() => {
		if (!state || entrance === 'done') return
		if (entrance === 'hidden') {
			const timer = window.setTimeout(machineBuilt, 1500)
			return () => clearTimeout(timer)
		}
		machineReady.resolve()
		const timer = window.setTimeout(() => setEntrance('done'), 1100)
		return () => clearTimeout(timer)
	}, [state, entrance, machineBuilt, machineReady])
	const [notice, setNotice] = useState('')
	const [pending, setPending] = useState(false), [reveal, setReveal] = useState<ShopSpin | null>(null)
	const [starting, setStarting] = useState(false)
	// The open card; only the rows' can be bought from it.
	const [detail, setDetail] = useState<Open | null>(null)
	// Closed cards still flying back to their slots, by `openKey`; their slots stay empty until they land.
	const [flying, setFlying] = useState<string[]>([])
	// A row does not scroll under a returning card (the morph takes ~570 ms), so its target holds still.
	const [locks, setLocks] = useState(0)
	const [now, setNow] = useState(Date.now)
	const [fresh, setFresh] = useState<ShopPrize[]>([])
	const [claiming, setClaiming] = useState(false)
	// Points that coins have carried into the counter before the server's total replaces them.
	const [landed, setLanded] = useState(0)
	const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
	const pill = useRef<HTMLParagraphElement>(null), coins = useRef<HTMLDivElement>(null), hero = useRef<HTMLElement>(null)
	const reduced = usePassReducedMotion()
	useEffect(() => { loadPop(); loadCelebrate(); loadQuestionSounds() }, [])

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
		const tick = window.setInterval(() => setNow(Date.now()), 20_000)
		const scheduled = timers.current
		return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); clearInterval(tick); for (const timer of scheduled) clearTimeout(timer) }
	}, [load])
	// Opening the shop clears the dot, also when a rotation arrives while it is open.
	useEffect(() => { if (state) markSeen() }, [state?.slot, markSeen])
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
			const result = await portalRequest<ShopSpin>('shop/spin', 'POST', { spinId: uuid(), free })
			setReveal(result)
			setState((current) => current && { ...current, points: result.points })
			if (isRewardSkin(result.skin)) unlocked(result.userId)
			// The card joins the collection once the reveal ends, so the grid does not spoil it.
			later(() => { setReveal(null); void load() }, Math.max(0, result.startedAt + GACHAPON_DURATION - Date.now()))
		} catch (cause) { fail(cause, 'No pude girar la máquina.') }
		finally { setPending(false) }
	}
	async function buy(prize: ShopPrize) {
		setNotice('')
		try {
			if (isRewardSkin(prize)) {
				const result = await portalRequest<ShopPurchase>('shop/buy', 'POST', { skin: prize })
				setState((current) => current && { ...current, points: result.points, owned: [...current.owned, result.skin] })
				if (user) unlocked(user.id)
			} else {
				const result = await portalRequest<CosmeticPurchase>('shop/cosmetic/buy', 'POST', { item: prize })
				setState((current) => current && { ...current, points: result.points, cosmetics: result.owned })
			}
			playCoin()
			return true
		} catch (cause) { fail(cause, 'No pude comprarlo.'); return false }
	}
	/** Flies `count` coins into the counter and adds `amount` as they land, exact on the last one. Resolves with what it added. */
	async function payOut(origin: DOMRect, amount: number, count: number, spread: number) {
		const target = pill.current?.getBoundingClientRect()
		if (!target) return 0
		let paid = 0
		await flyCoins(origin, target, count, spread, (i) => {
			const step = Math.round(amount * (i + 1) / count) - paid
			paid += step
			setLanded((current) => current + step)
			if (i === 0 || i === Math.floor(count / 2) || i === count - 1) playCoin()
		})
		return paid
	}
	/** Optimistic: the card turns at once and only turns back if the server says no. */
	async function turnCard(skin: ShopPrize, card: HTMLElement) {
		if (!state || state.revealed.includes(skin)) return
		setNotice('')
		setState((current) => current && { ...current, revealed: [...current.revealed, skin] })
		if (!reduced) setFresh((current) => [...current, skin])
		const request = portalRequest<ShopReveal>('shop/reveal', 'POST', { item: skin })
		const flight = reduced ? (playPop(), Promise.resolve(0)) : wait(FLIP_MS / 2).then(() => {
			playPop()
			return payOut(card.getBoundingClientRect(), SHOP_REVEAL_POINTS, 5, 120)
		})
		try {
			const [result, paid] = await Promise.all([request, flight])
			setState((current) => current && { ...current, points: result.points, revealed: [...new Set([...current.revealed, ...result.revealed])] })
			setLanded((current) => current - paid)
		} catch (cause) {
			setState((current) => current && { ...current, revealed: current.revealed.filter((item) => item !== skin) })
			fail(cause, 'No pude revelar la carta.')
			const paid = await flight
			setLanded((current) => current - paid)
		}
	}
	async function claimGift() {
		if (claiming) return
		setClaiming(true); setNotice('')
		try {
			const result = await portalRequest<ShopGiftClaim>('shop/gift', 'POST')
			if (result.gift.amount === SHOP_GIFT_STREAK_POINTS) playCelebrate()
			const from = coins.current?.getBoundingClientRect()
			if (reduced || !from) {
				playCoin()
				setState((current) => current && { ...current, gift: result.gift, points: result.points })
				return
			}
			// The ticket turns grey as the first coin leaves for the counter.
			later(() => setState((current) => current && { ...current, gift: result.gift }), COINS_FLY_AT)
			const paid = await payOut(from, result.gift.amount, 12, 200)
			setState((current) => current && { ...current, gift: result.gift, points: result.points })
			setLanded((current) => current - paid)
		} catch (cause) { fail(cause, 'No pude abrir el regalo.') }
		finally { setClaiming(false) }
	}
	const review = async () => {
		const active = await portalRequest<ShopReview>('shop/review', 'POST')
		setState((current) => current && { ...current, review: { ...current.review, active } })
	}
	async function startReview() {
		setStarting(true); setNotice('')
		try { await review(); return true } catch (cause) { fail(cause, 'No pude preparar el repaso.'); return false }
		finally { setStarting(false) }
	}
	/** Closing frees the rows at once: another card can open while this one flies home. */
	function closeDetail(open: Open) {
		setFlying((current) => [...current, openKey(open)])
		setDetail(null)
		if (reduced) return
		setLocks((current) => current + 1)
		later(() => setLocks((current) => current - 1), 650)
	}
	function cardHome(open: Open) {
		setFlying((current) => current.filter((item) => item !== openKey(open)))
		// The card is back in its slot on the next frame; focus returns to it, as it would after a dialog, unless the student moved on.
		requestAnimationFrame(() => {
			if (document.activeElement === document.body) document.querySelector<HTMLButtonElement>(`[data-place="${open.place}"] .shop-card[data-skin="${open.prize}"]`)?.focus({ preventScroll: true })
		})
	}
	const isOpen = (open: Open) => (detail?.place === open.place && detail.prize === open.prize) || flying.includes(openKey(open))
	async function answer(active: ShopReview, index: number, choice: number) {
		const result = await portalRequest<ShopAnswer>(`shop/review/${active.id}/answer`, 'POST', { index, answer: choice })
		// "Continuar repaso" and a reload resume after this question.
		const marked = { answer: result.correct ? result.right : choice, correct: result.correct, right: result.right }
		setState((current) => {
			const open = current?.review.active
			if (!current || open?.id !== active.id) return current
			return { ...current, review: { ...current.review, active: { ...open, results: open.results.map((item, i) => i === index ? marked : item) } } }
		})
		return result
	}
	const graded = (result: ShopAnswer) => setState((current) => current && { ...current, freeSpin: result.freeSpin, review: { attemptsLeft: result.attemptsLeft, active: null } })

	const student = state && !state.teacher
	// Plates are previewed with the name they will carry in the lists.
	const name = user?.name ?? 'Tu nombre'
	// In development a reset lives up by the points, out of the panel.
	const header = student ? <>
		{import.meta.env.DEV && <button type="button" className="shop-debug" onClick={() => void (async () => { await portalRequest('shop/debug/reset-review', 'POST', {}); await load() })()}>Debug: reiniciar preguntas</button>}
		<PointsPill value={state.points + landed} counting={landed !== 0} pill={pill} />
	</> : null
	return <LibraryShell title="Tienda" view="shop" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/')} actions={header} testId="portal-shop">
		<div className="shop" aria-busy={!state} data-entrance={state && entrance !== 'done' ? entrance : undefined}>
			{BLUR === 'filter' && <BlurFilters />}
			{loadError && !state && <p className="xp-error shop-alert" role="alert">{loadError} <button className="portal-link" onClick={() => void load()}>Reintentar</button></p>}
			{!state && !loadError && <ShopSkeleton hold={machineReady.promise} />}
			{state && <>
				{notice && <p className="shop-toast" role="alert" key={notice}>{notice}</p>}
				<section className="shop-hero" ref={hero}>
					<div className="shop-machine-frame"><ShopMachine state={state} pending={pending} reveal={reveal} onSpin={(free) => void spin(free)} onReady={machineBuilt} /></div>
					<Panel state={state} hero={hero} starting={starting} onReview={startReview} onAnswer={answer} onGraded={graded} onRetry={review}
						strip={(tray) => <Strip className="shop-strip" key={state.day} place="machine" list={tray.list} tray={tray.on} gathering={tray.gathering} cardWidth={tray.on ? CARD.tray : CARD.spread} handlers={tray.handlers} locked={locks > 0}>
							{state.pool.map((skin) => <motion.li key={skin} data-slot={skin} data-focus={(tray.on && tray.focus === skin) || undefined} layout={!reduced} transition={GATHER}>
								<ShopCard skin={skin} place="machine" faceUp width={tray.on ? CARD.tray : CARD.spread} state={state} name={name} open={isOpen({ prize: skin, place: 'machine' })} onOpen={() => setDetail({ prize: skin, place: 'machine' })} />
							</motion.li>)}
						</Strip>} />
				</section>
				{ROWS.map((row) => <section key={row.place} className="shop-cards" data-row={row.place} aria-labelledby={`shop-${row.place}-title`}>
					<div className="shop-cards__heading">
						<h2 id={`shop-${row.place}-title`}>{row.title}</h2>
						<p className="shop-cards__meter"><Icon name="rotate" size={16} /><span className="xp-sr-only">Cambian en </span><Countdown at={state.rotatesAt} /></p>
					</div>
					<Strip className="shop-row" key={state.slot} place={row.place} cardWidth={CARD.row} locked={locks > 0}>
						{row.items(state).map((skin) => <li key={skin} data-slot={skin}>
							<ShopCard skin={skin} place={row.place} width={CARD.row} state={state} name={name} fresh={fresh.includes(skin)} open={isOpen({ prize: skin, place: row.place })}
								onReveal={(card, element) => void turnCard(card, element)} onOpen={() => setDetail({ prize: skin, place: row.place })} onFlashed={() => setFresh((current) => current.filter((item) => item !== skin))} />
						</li>)}
						{row.place === 'cards' && <li className="shop-gift-slot">
							<GiftTicket gift={state.gift} teacher={state.teacher} claiming={claiming} coins={coins} onClaim={() => void claimGift()} />
						</li>}
					</Strip>
				</section>)}
			</>}
		</div>
		{reveal && state && <GachaponReveal result={reveal} cover={state.cover} />}
		<AnimatePresence mode="sync">{detail && state && <CardDetail key={openKey(detail)} open={detail} state={state} name={name} onBuy={buy} onClose={() => closeDetail(detail)} onLanded={() => cardHome(detail)} />}</AnimatePresence>
	</LibraryShell>
}

/** The hero's right column: the machine's cards and the review that earns the free spin next to it. */
function Panel({ state, hero, starting, strip, onReview, onAnswer, onGraded, onRetry }: {
	strip: (tray: Tray) => ReactNode
	state: ShopState; hero: RefObject<HTMLElement | null>; starting: boolean; onReview: () => Promise<boolean>
	onAnswer: (review: ShopReview, index: number, answer: number) => Promise<ShopAnswer>; onGraded: (result: ShopAnswer) => void; onRetry: () => Promise<void>
}) {
	const { freeSpin, review } = state
	const [graded, setGraded] = useState<ShopAnswer | null>(null), [open, setOpen] = useState(false), [grading, setGrading] = useState(false)
	// The rain falls inside the gachapon panel, measured as it starts.
	const [celebration, setCelebration] = useState<{ id: string; height: number; leaving?: boolean } | null>(null)
	const panel = useRef<HTMLElement>(null), title = useRef<HTMLHeadingElement>(null)
	const view = graded ? 'failed' : !state.teacher && open && review.active ? 'quiz' : 'free'
	const list = useRef<HTMLUListElement>(null), tray = useTray(list, view === 'quiz')
	// Once the free spin is earned, spent or out of reach for today, the title says so and stands alone.
	const outcome = state.teacher || view !== 'free' ? null : freeSpin === 'available' ? 'available'
		: freeSpin === 'used' || (!review.active && !review.attemptsLeft) ? 'later' : null
	// One rain at a time; it outlives the question it celebrates and fades out before it leaves.
	useEffect(() => {
		if (!celebration) return
		const fade = !celebration.leaving && !matchMedia('(prefers-reduced-motion: reduce)').matches
		const timer = setTimeout(() => setCelebration(fade ? { ...celebration, leaving: true } : null), celebration.leaving ? 500 : 2500)
		return () => clearTimeout(timer)
	}, [celebration])
	// Opening the quiz brings the whole panel into view.
	useEffect(() => {
		if (view === 'quiz') panel.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
	}, [view, review.active?.id])
	function finish(result: ShopAnswer) {
		setOpen(false)
		onGraded(result)
		if (!result.passed) { setGraded(result); return }
		playCelebrate()
		// The quiz held focus; the new title takes it, so keyboard and screen reader users hear it.
		requestAnimationFrame(() => title.current?.focus({ preventScroll: true }))
	}
	/**
	 * A scrolled strip slides back to its start before the cards gather. The deck does not scroll, and the browser would reset
	 * the scroll in the gather's first frame, which Motion reads as a scroll rather than a move, so the cards would jump.
	 */
	function openQuiz(then?: () => void) {
		const strip = list.current, from = strip?.scrollLeft ?? 0
		const show = () => { then?.(); setOpen(true) }
		if (!strip || !from) { show(); return }
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) { strip.scrollLeft = 0; show(); return }
		// Snapping would pull each step back to the nearest card; the gather turns it off from here on.
		strip.style.scrollSnapType = 'none'
		const start = performance.now()
		const step = (time: number) => {
			const t = Math.min(1, (time - start) / REWIND_MS)
			strip.scrollLeft = from * (1 - REWIND_EASE(t))
			requestAnimationFrame(t < 1 ? step : () => { strip.style.scrollSnapType = ''; show() })
		}
		requestAnimationFrame(step)
	}
	async function retry() {
		await onRetry()
		openQuiz(() => setGraded(null))
	}
	async function start() {
		if (await onReview()) openQuiz()
	}

	const free = state.teacher ? <p className="shop-panel__note">Los alumnos ganan una tirada gratis al repasar 3 preguntas.</p>
		: review.active ? <button className="shop-button" onClick={() => openQuiz()}>Continuar repaso</button>
		: <button className="shop-button" disabled={starting} onClick={() => void start()}>{starting ? 'Preparando…' : 'Repasar 3 preguntas'}</button>
	const heading = outcome === 'available' ? 'Felicidades! Reclama tu tirada gratis! :)' : outcome === 'later' ? 'Vuelve mañana por otra tirada!' : '¡Repasa los conceptos de clase y gana una tirada! :)'
	const headline = <h2 id="shop-panel-title" className="shop-panel__title" ref={title} tabIndex={-1} key={heading}>{heading}</h2>
	// While the cards gather or spread, the panel does not clip them either; only the hero's rounded edge does.
	return <section className="shop-panel" ref={panel} aria-labelledby="shop-panel-title" data-outcome={outcome ?? undefined} data-gathering={tray.gathering || undefined}>
		{strip(tray)}
		<TrayPreview skin={tray.shown ? tray.focus : null} list={list} panel={panel} state={state} />
		<div className="shop-panel__content" data-view={view} key={view}>
			{view === 'quiz' ? <div className="shop-panel__head">
				{/* Closing keeps the attempt; "Continuar repaso" resumes it. */}
				<button type="button" className="xp-icon-button shop-panel__back" aria-label="Cerrar el repaso" disabled={grading} onClick={() => setOpen(false)}><Icon name="back" /></button>
				{headline}
			</div> : headline}
			{!outcome && <div className="shop-panel__step" data-view={view} data-testid="shop-free-spin">
				{view === 'quiz' && review.active ? <Quiz key={review.active.id} review={review.active}
					onAnswer={(index, answer) => onAnswer(review.active!, index, answer)} onCorrect={(id) => setCelebration({ id, height: hero.current?.clientHeight ?? 0 })} onDone={finish} onGrading={setGrading} />
					: view === 'failed' && graded ? <Failed result={graded} onRetry={retry} onDone={() => { setGraded(null); setOpen(false) }} />
					: free}
			</div>}
		</div>
		{celebration && hero.current && createPortal(<Celebration key={celebration.id} id={celebration.id} height={celebration.height} leaving={celebration.leaving} />, hero.current)}
	</section>
}

type TrayHandlers = Pick<HTMLAttributes<HTMLUListElement>, 'onPointerOver' | 'onPointerLeave' | 'onClickCapture'>
type Tray = { on: boolean; gathering: boolean; focus: ShopPrize | null; list: RefObject<HTMLUListElement | null>; handlers: TrayHandlers }

/** The quiz's deck: a card is focused only while a mouse is over it, and its preview rises while it is. Touch taps open the detail directly. */
function useTray(list: RefObject<HTMLUListElement | null>, on: boolean) {
	const reduced = usePassReducedMotion()
	const [hovered, setHovered] = useState<ShopPrize | null>(null)
	useEffect(() => setHovered(null), [on])
	// The mode settles 600 ms after it changes; deriving it in render marks the very commit that starts the gather.
	const [settled, setSettled] = useState(on), gathering = on !== settled
	useEffect(() => {
		const timer = setTimeout(() => setSettled(on), 600)
		return () => clearTimeout(timer)
	}, [on])
	const handlers: TrayHandlers = on ? {
		onPointerOver: (event) => {
			const slot = (event.target as Element).closest<HTMLElement>('[data-slot]')
			if (event.pointerType === 'mouse' && slot) setHovered(slot.dataset.slot as ShopPrize)
		},
		onPointerLeave: () => setHovered(null),
		// A card opening in the detail ends the preview at once.
		onClickCapture: () => setHovered(null),
	} : {}
	const focus = on ? hovered : null
	return { on, gathering, focus, list, handlers, shown: !reduced && !!focus }
}

const PREVIEW_W = 150
/** The focused card at full size over the quiz, risen from its thumbnail while the pointer stays on it. */
function TrayPreview({ skin, list, panel, state }: { skin: ShopPrize | null; list: RefObject<HTMLUListElement | null>; panel: RefObject<HTMLElement | null>; state: ShopState }) {
	const { user } = usePortal()
	const [left, setLeft] = useState(PREVIEW_W / 2)
	useLayoutEffect(() => {
		const slot = skin && list.current?.querySelector(`[data-slot="${skin}"]`)?.getBoundingClientRect(), frame = panel.current
		if (!slot || !frame) return
		const box = frame.getBoundingClientRect()
		setLeft(Math.min(Math.max(slot.left + slot.width / 2 - box.left, PREVIEW_W / 2), frame.clientWidth - PREVIEW_W / 2))
	}, [skin, list, panel])
	const draft = useMemo(() => skin && prizeDraft(skin, state.cover), [skin, state.cover])
	return <AnimatePresence>
		{skin && draft && <motion.div className="shop-tray__preview" aria-hidden="true" data-skin={skin} style={{ x: '-50%' }}
			initial={{ opacity: 0, scale: 0.23, y: -36, left }} animate={{ opacity: 1, scale: 1, y: 0, left }} transition={{ type: 'spring', duration: 0.5, bounce: 0.18 }}
			exit={{ opacity: 0, scale: 0.23, y: -36, transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.div key={skin} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} style={{ borderRadius: radius(PREVIEW_W) }}>
					<div className="shop-float"><PassCard draft={draft} variant="shop" tilt={false} hero={false}
							face={prizeItem(skin) && <PrizeFace prize={skin} cover={state.cover} name={user?.name ?? 'Tu nombre'} />} /></div>
				</motion.div>
			</AnimatePresence>
		</motion.div>}
	</AnimatePresence>
}


/** How each edge's overlay blurs the cards under it. Chromium on macOS ignores a mask over a backdrop filter, so there the filter fades itself inward:
 *  an SVG filter mixes the blurred backdrop with the sharp one along a ramp. Safari and Firefox mask the blur instead. */
const BLUR = typeof navigator !== 'undefined' && 'userAgentData' in navigator ? 'filter' : 'mask'
/** An alpha ramp the filter stretches over the overlay: opaque at the outer edge, clear at the inner one. */
const blurRamp = (side: 'left' | 'right') => {
	const stops = side === 'left' ? [[0, 1], [0.35, 1], [1, 0]] : [[0, 0], [0.65, 1], [1, 1]]
	const gradient = stops.map(([offset, alpha]) => `<stop offset="${offset}" stop-color="#fff" stop-opacity="${alpha}"/>`).join('')
	return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="8" preserveAspectRatio="none"><defs><linearGradient id="g">${gradient}</linearGradient></defs><rect width="72" height="8" fill="url(#g)"/></svg>`)}`
}
/** The two edge filters, once per page. */
function BlurFilters() {
	return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
		{(['left', 'right'] as const).map((side) => <filter key={side} id={`shop-blur-${side}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
			<feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
			<feImage href={blurRamp(side)} preserveAspectRatio="none" result="ramp" />
			<feComposite in="blur" in2="ramp" operator="in" result="blurred" />
			<feComposite in="SourceGraphic" in2="ramp" operator="out" result="sharp" />
			<feMerge><feMergeNode in="sharp" /><feMergeNode in="blurred" /></feMerge>
		</filter>)}
	</defs></svg>
}

/** One row of cards that only scrolls sideways. Its edges fade where more cards wait past them. */
function Strip({ className, place, list: given, tray = false, gathering = false, cardWidth, handlers, locked, children }: {
	className: string; place: Place; list?: RefObject<HTMLUListElement | null>; tray?: boolean; gathering?: boolean; cardWidth: number; handlers?: TrayHandlers; locked: boolean; children: ReactNode
}) {
	const own = useRef<HTMLUListElement>(null), list = given ?? own
	const [more, setMore] = useState<'left' | 'right' | 'both'>()
	// While the cards gather or spread, the stage's hover lift stays off so only the layout animation moves them, and the strip does not clip or fade them.
	// Its edges are measured again once the cards settle, before that frame paints, so the fades return with the clip.
	useLayoutEffect(() => {
		if (gathering) return
		// The tray never scrolls, so it has no edges to fade.
		if (tray) { setMore(undefined); return }
		const strip = list.current!
		const update = () => {
			const left = strip.scrollLeft > 2, right = strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 2
			setMore(left && right ? 'both' : left ? 'left' : right ? 'right' : undefined)
		}
		update()
		// The strip and its slots change size as the cards gather and spread.
		const observer = new ResizeObserver(update)
		observer.observe(strip)
		for (const slot of strip.children) observer.observe(slot)
		strip.addEventListener('scroll', update, { passive: true })
		return () => { observer.disconnect(); strip.removeEventListener('scroll', update) }
	}, [list, tray, gathering])
	// Programmatic scrolls can still move an `overflow-y: hidden` box; the strip only ever scrolls sideways.
	// Past an edge with more cards, the cards blur and fade out under an overlay; the wrapper holds the overlays over the scrolling list.
	return <div className="shop-scroller" data-more={more} data-blur={BLUR}>
		<motion.ul ref={list} className={className} layoutScroll data-place={place} data-tray={tray || undefined} data-gathering={gathering || undefined} data-more={more} data-locked={locked || undefined} {...handlers}
			style={{ '--card-w': `${cardWidth}px` } as CSSProperties} onScroll={(event) => { if (event.currentTarget.scrollTop) event.currentTarget.scrollTop = 0 }}>
			{children}
		</motion.ul>
		<i className="shop-scroller__fade" data-side="left" aria-hidden="true" />
		<i className="shop-scroller__fade" data-side="right" aria-hidden="true" />
	</div>
}

const LETTERS = 'ABCD'
const attempts = (count: number) => count === 1 ? 'Te queda 1 intento hoy.' : `Te quedan ${count} intentos hoy.`
/** How long a graded answer stays on screen before the next question. */
const ADVANCE_MS = 1300

/** One question at a time, graded as soon as it is answered. The server keeps each key until then. */
function Quiz({ review, onAnswer, onCorrect, onDone, onGrading }: {
	review: ShopReview
	onAnswer: (index: number, answer: number) => Promise<ShopAnswer>; onCorrect: (id: string) => void; onDone: (result: ShopAnswer) => void
	onGrading: (grading: boolean) => void
}) {
	const reduced = usePassReducedMotion()
	const [results, setResults] = useState(review.results)
	// A resumed attempt starts at the first question without an answer.
	const [index, setIndex] = useState(() => Math.max(0, review.results.indexOf(null)))
	const [picked, setPicked] = useState<number | null>(null), [shake, setShake] = useState(false), [error, setError] = useState('')
	const heading = useRef<HTMLHeadingElement>(null), advance = useRef<ReturnType<typeof setTimeout>>(undefined)
	const question = review.questions[index], result = results[index]
	// Focus follows the question and its result for keyboard and screen reader users.
	useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [index, !!result])
	useEffect(() => () => clearTimeout(advance.current), [])
	// The panel's back arrow waits while an answer is graded and shown.
	useEffect(() => { onGrading(picked !== null); return () => onGrading(false) }, [picked])

	async function choose(answer: number) {
		if (picked !== null || result) return
		setPicked(answer); setError('')
		try {
			const graded = await onAnswer(index, answer)
			setResults((current) => current.map((item, i) => i === index ? { answer: graded.correct ? graded.right : answer, correct: graded.correct, right: graded.right } : item))
			if (graded.correct) { playCorrect(); if (!reduced) onCorrect(`${review.id}-${index}`) }
			else { playIncorrect(); if (!reduced) setShake(true) }
			advance.current = setTimeout(() => {
				if (graded.done) { onDone(graded); return }
				setIndex(index + 1); setPicked(null); setShake(false)
			}, ADVANCE_MS)
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude revisar tu respuesta.'); setPicked(null) }
	}
	const mark = (i: number) => !result ? undefined : i === result.right ? 'right' : i === result.answer ? 'wrong' : undefined

	return <div className="shop-review" data-testid="shop-review">
		<div className="shop-review__progress" aria-hidden="true">{review.questions.map((_, i) => <i key={i} data-state={results[i] ? 'done' : i === index ? 'current' : 'next'} />)}</div>
		<div className="shop-review__step" key={index}>
			<h3 ref={heading} tabIndex={-1} className="shop-review__question">{question.question}</h3>
			<div className="shop-review__answers" role="group" aria-label="Respuestas" data-shake={shake || undefined}>
				{question.answers.map((answer, i) => <button key={i} className="shop-review__answer" aria-pressed={(result?.answer ?? picked) === i} data-result={mark(i)}
					disabled={picked !== null || !!result} onClick={() => void choose(i)}>
					<span aria-hidden="true">{LETTERS[i]}</span>{answer}
				</button>)}
			</div>
		</div>
		{error && <p className="xp-error" role="alert">{error}</p>}
	</div>
}

/** Moves focus to a result's heading, so keyboard and screen reader users hear it. */
function useFocused() {
	const heading = useRef<HTMLHeadingElement>(null)
	useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
	return heading
}

function Failed({ result, onRetry, onDone }: { result: ShopAnswer; onRetry: () => Promise<void>; onDone: () => void }) {
	const heading = useFocused()
	const [busy, setBusy] = useState(false), [error, setError] = useState('')
	async function retry() {
		setBusy(true); setError('')
		try { await onRetry() } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude preparar otro repaso.'); setBusy(false) }
	}
	return <div className="shop-review__result" data-passed="false">
		<h3 ref={heading} tabIndex={-1}>Casi</h3>
		<p>{result.attemptsLeft ? `${attempts(result.attemptsLeft)} Cada intento trae preguntas nuevas.` : 'Sin intentos por hoy. Mañana hay otra oportunidad.'}</p>
		{error && <p className="xp-error" role="alert">{error}</p>}
		{result.attemptsLeft > 0 ? <button className="shop-button" disabled={busy} onClick={() => void retry()}>{busy ? 'Preparando…' : 'Intentar de nuevo'}</button>
			: <button className="shop-review__back" onClick={onDone}>Entendido</button>}
	</div>
}

/** Counts up to a new total; spending, and coins landing one by one, show at once. */
function PointsPill({ value, counting, pill }: { value: number; counting: boolean; pill: RefObject<HTMLParagraphElement | null> }) {
	const reduced = usePassReducedMotion()
	const [shown, setShown] = useState(value)
	const target = useRef(value)
	useEffect(() => {
		const from = target.current
		target.current = value
		if (value <= from || reduced || counting) { setShown(value); return }
		const start = performance.now()
		let frame = 0
		const step = (time: number) => {
			const t = Math.min(1, (time - start) / 520)
			setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3)))
			if (t < 1) frame = requestAnimationFrame(step)
		}
		frame = requestAnimationFrame(step)
		return () => { cancelAnimationFrame(frame); setShown(value) }
	}, [value, reduced, counting])
	return <p className="shop-points xp-reveal" ref={pill} aria-live="polite">
		<span className="shop-coin" aria-hidden="true" /><strong key={value} data-testid="shop-points">{points(shown)}</strong><span className="xp-sr-only"> puntos</span>
	</p>
}

/** A gold ticket for showing up. Five days in a row pay more, every day while the streak holds. */
function GiftTicket({ gift, teacher, claiming, coins, onClaim }: { gift: ShopGift; teacher: boolean; claiming: boolean; coins: RefObject<HTMLDivElement | null>; onClaim: () => void }) {
	const past = gift.claimed ? gift.streak - 1 : gift.streak
	const today = Math.min(Math.max(past, 0), SHOP_GIFT_STREAK_DAYS - 1)
	const cell = (i: number) => teacher ? 'next' : i < today || (i === today && gift.claimed) ? 'done' : i === today ? 'today' : 'next'
	return <section className="shop-gift" data-claimed={gift.claimed} data-testid="shop-gift" aria-labelledby="shop-gift-title">
		<p className="shop-gift__eyebrow" id="shop-gift-title">Regalo</p>
		<div className="shop-gift__coins" ref={coins} aria-hidden="true"><i /><i /><i /><i /></div>
		<p className="shop-gift__amount">+{points(gift.amount)}<span className="xp-sr-only"> puntos</span></p>
		<ol className="shop-gift__streak" aria-hidden="true">{Array.from({ length: SHOP_GIFT_STREAK_DAYS }, (_, i) => <li key={i} data-state={cell(i)} />)}</ol>
		{gift.claimed ? <p className="shop-gift__done">{teacher ? 'Vista previa' : 'Mañana'}</p>
			: <button className="shop-gift__claim" disabled={claiming} onClick={onClaim}>Reclamar</button>}
	</section>
}

const CARD_BACK = <img className="shop-card-back" src={cardBack} alt="" draggable={false} />

/**
 * The shared-element morph between a card's slot and the detail, as one card moving rather than a copy. Layout morphs run a 0–1000 progress;
 * resting within 3 of it, about a pixel, ends the morph when the card looks in place rather than ~150 ms later.
 */
const MORPH = { type: 'spring', stiffness: 260, damping: 30, restDelta: 3, restSpeed: 30 } as const
const morphId = (place: Place, skin: ShopPrize) => `shop-card-${place}-${skin}`

/**
 * The profile card in its shop dress, with the same tilt, lamp and flip. A cosmetic shows its preview on the front, dressed on the
 * student's cover. Face down it is a "Revelar carta" button; face up it opens the detail, where it is bought. While the detail is open
 * the card is there, and its slot stays empty. The machine's cards in the hero are always face up.
 */
function ShopCard({ skin, place, faceUp = false, width, state, name, fresh = false, open, onReveal, onOpen, onFlashed }: {
	skin: ShopPrize; place: Place; faceUp?: boolean; width: number; state: ShopState; name: string; fresh?: boolean; open: boolean
	onReveal?: (skin: ShopPrize, card: HTMLElement) => void; onOpen: () => void; onFlashed?: () => void
}) {
	const draft = useMemo(() => prizeDraft(skin, state.cover), [skin, state.cover])
	const reduced = usePassReducedMotion()
	const revealed = faceUp || state.revealed.includes(skin), owned = hasPrize(skin, state)
	const stage = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null)
	const mode = revealed ? 'view' : 'reveal'
	/** Waits for the card to accept focus again, unless the student moved on. */
	function refocus(delay: number, tries: number) {
		setTimeout(() => {
			if (document.activeElement !== document.body) return
			button.current?.focus({ preventScroll: true })
			if (document.activeElement !== button.current && tries) refocus(100, tries - 1)
		}, delay)
	}
	function press() {
		if (mode === 'view') { onOpen(); return }
		// The overlay is inert while the card turns, so a keyboard reveal gets its focus back afterwards.
		const focused = document.activeElement === button.current
		onReveal?.(skin, stage.current!)
		if (focused) refocus(FLIP_MS, 12)
	}
	const slot = { 'data-open': open, 'data-revealed': revealed, 'data-owned': revealed && owned, 'data-mode': mode, style: { '--card-color': prizeColor(skin) } as CSSProperties }
	if (open) return <div className="shop-card-slot" {...slot} />
	const actions = <button ref={button} className="shop-card" data-mode={mode} data-owned={owned} data-skin={skin} aria-label={revealed ? `Ver ${prizeName(skin)}` : 'Revelar carta'} onClick={press} />
	// The face is drawn only once turned, so a face-down card never gives its rarity away to the page.
	const face = !prizeItem(skin) || !revealed ? undefined : place === 'machine' ? <PrizeFace prize={skin} cover={state.cover} name={name} /> : <PrizeCover prize={skin} cover={state.cover} name={name} width={width} />
	return <div className="shop-card-slot" {...slot}>
		<div className="shop-card-stage" ref={stage}>
			{/* `layoutId` alone animates its layout too. It moves with the slot's spring, so the card never drifts inside a gathering slot; the morph uses the detail's own spring.
			    The machine's cards change size, so their corners ease with that spring too; the row's never do. */}
			<motion.div layoutId={reduced ? undefined : morphId(place, skin)} transition={GATHER} {...(faceUp ? { initial: false, animate: { borderRadius: radius(width) } } : { style: { borderRadius: radius(width) } })}>
				<PassCard draft={draft} variant="shop" back={!revealed} backFace={CARD_BACK} actions={actions} hero={false} face={face} />
			</motion.div>
			{/* The flash reaches past the card, so it leaves once it fades; left behind, it let the row scroll vertically. */}
			{fresh && <span className="shop-burst" aria-hidden="true" onAnimationEnd={onFlashed}><b /></span>}
		</div>
	</div>
}

type BuyMode = 'buy' | 'confirm' | 'busy' | 'short' | 'owned' | 'preview'
/** The veil and the close button fade in, and out as the card heads home. */
const fade = (leaving: boolean) => ({ initial: { opacity: 0 }, animate: { opacity: leaving ? 0 : 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } })

/**
 * A face-up card at full size: the strip or row card itself grows to the centre and goes back on close. For an item in a row, the first tap asks,
 * the second buys. Materials and frames are worn live on the student's cover here, the one hero on the page; a plate draws its shader live.
 * It is a hand-made modal because a dialog portal mounts a render late, and the morph needs both ends in the same commit.
 */
function CardDetail({ open: { prize: skin, place }, state, name, onBuy, onClose, onLanded }: {
	open: Open; state: ShopState; name: string; onBuy: (skin: ShopPrize) => Promise<boolean>; onClose: () => void; onLanded: () => void
}) {
	// Closing removes the detail at once; it stays mounted, inert, only while the card flies home.
	const [present, safeToRemove] = usePresence()
	const leaving = !present, purchasable = place !== 'machine'
	const item = prizeItem(skin)
	const draft = useMemo(() => prizeDraft(skin, state.cover), [skin, state.cover])
	const reduced = usePassReducedMotion()
	const owned = hasPrize(skin, state), cost = prizePrice(skin, state), missing = cost - state.points
	const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false)
	// The name, the rarity and the price rise in once the card is in place; they are laid out from the start, so nothing moves when they show.
	const [arrived, setArrived] = useState(reduced)
	useEffect(() => {
		// In case the morph never reports its end, for example in a background tab.
		const timer = setTimeout(() => setArrived(true), 900)
		return () => clearTimeout(timer)
	}, [])
	// Compiling a live shader stalls the page and the GPU for up to a few hundred ms, so it waits until the card and its text are still,
	// and never starts on the way home. Until then the baked sheets stand in, the same the row shows.
	const [settled, setSettled] = useState(reduced), [lit, setLit] = useState(false)
	useEffect(() => {
		if (!arrived || settled || leaving) return
		const timer = setTimeout(() => setSettled(true), 300)
		return () => clearTimeout(timer)
	}, [arrived, settled, leaving])
	const root = useRef<HTMLDivElement>(null), buyButton = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null)
	const title = useId()
	// On close the card flies back to its slot here, above the strip's clipping, then hands over to the slot card in place.
	const [home, setHome] = useState<DOMRect | null>(null)
	// The card's corners follow its width: the frame's while open, the slot's as it lands.
	const frame = useRef<HTMLDivElement>(null), [frameWidth, setFrameWidth] = useState(360)
	useLayoutEffect(() => setFrameWidth(frame.current!.getBoundingClientRect().width), [])
	const mode: BuyMode = owned ? 'owned' : state.teacher ? 'preview' : busy ? 'busy' : missing > 0 ? 'short' : confirming ? 'confirm' : 'buy'
	const enabled = mode === 'buy' || mode === 'confirm'
	useEffect(() => {
		if (!confirming) return
		const timer = setTimeout(() => setConfirming(false), 4000)
		return () => clearTimeout(timer)
	}, [confirming])
	useEffect(() => { (purchasable && enabled ? buyButton : close).current?.focus({ preventScroll: true }) }, [])
	const price = points(cost)

	const land = useRef<() => void>(undefined)
	useLayoutEffect(() => {
		if (present) return
		let done = false
		land.current = () => { if (!done) { done = true; safeToRemove?.(); onLanded() } }
		const slot = document.querySelector(`[data-place="${place}"] [data-slot="${skin}"]`)?.getBoundingClientRect()
		if (reduced || !slot) { land.current(); return }
		setHome(slot)
		// In case the spring never reports its end, for example in a background tab.
		const timer = setTimeout(land.current, 900)
		return () => clearTimeout(timer)
	}, [present])
	const dismiss = () => { if (!leaving) onClose() }
	/** Esc closes; Tab stays inside, as in a dialog. */
	const keys = (event: KeyboardEvent) => {
		if (leaving) return
		if (event.key === 'Escape') { event.preventDefault(); dismiss(); return }
		if (event.key !== 'Tab') return
		const focusable = [...root.current!.querySelectorAll<HTMLButtonElement>('button:enabled')]
		const at = focusable.indexOf(document.activeElement as HTMLButtonElement)
		event.preventDefault()
		focusable[(at + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus()
	}
	async function press() {
		if (mode === 'buy') { setConfirming(true); return }
		if (mode !== 'confirm') return
		setBusy(true)
		const success = await onBuy(skin)
		setBusy(false); setConfirming(false)
		// The button turns into a disabled "Ya lo tienes", so focus moves to the next useful control.
		if (success) close.current?.focus()
	}
	const label = mode === 'buy' ? <><span className="shop-coin" aria-hidden="true" />Comprar · {price}</> : mode === 'confirm' ? `Confirmar · ${price}` : mode === 'busy' ? 'Comprando…'
		: mode === 'owned' ? (isRewardSkin(skin) ? 'Ya la tienes' : 'Ya lo tienes') : mode === 'short' ? `Te faltan ${points(missing)} puntos` : `${price} puntos`

	return createPortal(<div className="shop-detail" ref={root} role="dialog" aria-modal="true" aria-labelledby={title} data-leaving={leaving} inert={leaving} onKeyDown={keys}>
		<motion.div className="shop-detail-overlay" {...fade(leaving)} onClick={dismiss} />
		<div className="shop-detail__content" data-testid="shop-card-detail" onClick={(event) => { if (event.target === event.currentTarget) dismiss() }}>
			<div className="shop-detail__frame" ref={frame}>
				<motion.div className="shop-detail__card" layoutId={reduced ? undefined : morphId(place, skin)} layout={!reduced} transition={MORPH}
					style={{ borderRadius: radius(home ? home.width : frameWidth), '--card-color': prizeColor(skin), ...(home && { position: 'fixed', left: home.left, top: home.top, width: home.width }) } as CSSProperties}
					onLayoutAnimationComplete={() => { if (home) land.current?.(); else setArrived(true) }}>
					<div className="shop-float"><PassCard draft={draft} variant="shop" live={settled} onLive={() => setLit(true)}
						face={item?.kind === 'plate' ? <PrizeCover prize={skin} cover={state.cover} name={name} width={frameWidth} caption={false} live={settled} /> : undefined} /></div>
					{item?.kind === 'material' && <span className="shop-detail__baked" data-lit={lit || undefined}><PrizeCover prize={skin} cover={state.cover} name={name} width={purchasable ? CARD.row : undefined} caption={false} /></span>}
					{/* A row's card prints its name; here it fades as the card grows, and the card in its slot brings it back. */}
					{item && purchasable && !reduced && <PrizeCaption prize={skin} leaving />}
				</motion.div>
			</div>
			<div className="shop-detail__text" data-shown={arrived || undefined}>
				<h2 className="shop-detail__name" id={title}>{prizeName(skin)}</h2>
				{item && <RarityChip prize={skin} />}
				{purchasable && <button ref={buyButton} className="shop-detail__buy" data-mode={mode} disabled={!enabled} onClick={() => void press()}>{label}</button>}
			</div>
		</div>
		<motion.button className="xp-icon-button shop-detail__close" aria-label="Cerrar" ref={close} onClick={dismiss} {...fade(leaving)}><Icon name="close" /></motion.button>
	</div>, document.body)
}

function ShopSkeleton({ hold }: { hold: Promise<void> }) {
	// It stays in front until the shop is ready to fade in.
	return <PageSkeleton className="shop-skeleton" hold={hold} label="Abriendo la tienda"><ShopShape /></PageSkeleton>
}
