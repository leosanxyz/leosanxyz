import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, usePresence } from 'motion/react'
import { GACHAPON_DURATION } from '../../shared/gachaponShape'
import { defaultHologram, defaultPass, type PassDraft, type RewardSkin } from '../../shared/pass'
import {
	SHOP_GIFT_STREAK_DAYS, SHOP_GIFT_STREAK_POINTS, SHOP_REVEAL_POINTS,
	type ShopAnswer, type ShopGift, type ShopGiftClaim, type ShopPurchase, type ShopReveal, type ShopReview, type ShopSpin, type ShopState,
} from '../../shared/shop'
import { LibraryShell } from '../boards/LibraryShell'
import { useBoardLibrary } from '../boards/useBoardLibrary'
import { boardViewPath } from '../boards/useBoardView'
import { Icon } from '../components/Icon'
import { GachaponReveal } from '../gachapon/GachaponReveal'
import { loadCelebrate, loadPop, playCelebrate, playCoin, playPop } from '../gachapon/gachaponSounds'
import { navigate } from '../navigation'
import { Celebration } from '../questions/QuestionCelebrations'
import { loadQuestionSounds, playCorrect, playIncorrect } from '../questions/useQuestionSounds'
import { portalRequest } from '../portal/api'
import { skins } from '../portal/pass/catalog'
import { PassCard } from '../portal/pass/PassCard'
import { usePassReducedMotion } from '../portal/pass/usePassReducedMotion'
import { usePortal } from '../portal/PortalProvider'
import { uuid } from '../uuid'
import { ShopMachine } from './ShopMachine'
import { COINS_FLY_AT, flyCoins } from './coins'
import { useShopNotice } from './shopNotice'
import './shop.css'

const unlocked = (userId: string) => window.dispatchEvent(new CustomEvent('xp-skin-unlocked', { detail: { userId } }))
const points = (value: number) => value.toLocaleString('es-MX')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The pass flip in `PassCard`; the flash, the sound and the coins start on its midpoint. */
const FLIP_MS = 480

/** The profile's grid foil in full spectrum: on these illustrations it reads better than one hue per card. */
function shopDraft(skin: RewardSkin): PassDraft {
	const art = skins.find((item) => item.id === skin)!
	return { ...defaultPass(art.name, skin), finish: 'prism', hologram: { ...defaultHologram(), hue: 360 } }
}

function countdown(ms: number) {
	return ms >= 3_600_000 ? `${Math.ceil(ms / 3_600_000)} h` : ms >= 60_000 ? `${Math.ceil(ms / 60_000)} min` : 'menos de 1 min'
}

export default function Shop() {
	const { user } = usePortal()
	const { library } = useBoardLibrary()
	const { markSeen } = useShopNotice(user?.role === 'student' ? user.id : undefined)
	const [state, setState] = useState<ShopState | null>(null), [loadError, setLoadError] = useState('')
	const [notice, setNotice] = useState('')
	const [pending, setPending] = useState(false), [reveal, setReveal] = useState<ShopSpin | null>(null)
	const [starting, setStarting] = useState(false)
	const [detail, setDetail] = useState<RewardSkin | null>(null)
	// Closed cards still flying back to their slots; their slots stay empty until they land.
	const [flying, setFlying] = useState<RewardSkin[]>([])
	// The row does not scroll under a returning card (the morph takes ~570 ms), so its target holds still.
	const [locks, setLocks] = useState(0)
	const [now, setNow] = useState(Date.now)
	const [fresh, setFresh] = useState<RewardSkin[]>([])
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
			const result = await portalRequest<ShopSpin>('shop/spin', 'POST', { spinId: uuid(), free })
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
	async function turnCard(skin: RewardSkin, card: HTMLElement) {
		if (!state || state.revealed.includes(skin)) return
		setNotice('')
		setState((current) => current && { ...current, revealed: [...current.revealed, skin] })
		if (!reduced) setFresh((current) => [...current, skin])
		const request = portalRequest<ShopReveal>('shop/reveal', 'POST', { skin })
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
	/** Closing frees the row at once: another card can open while this one flies home. */
	function closeDetail(skin: RewardSkin) {
		setFlying((current) => [...current, skin])
		setDetail(null)
		if (reduced) return
		setLocks((current) => current + 1)
		later(() => setLocks((current) => current - 1), 650)
	}
	function cardHome(skin: RewardSkin) {
		setFlying((current) => current.filter((item) => item !== skin))
		// The card is back in its slot on the next frame; focus returns to it, as it would after a dialog, unless the student moved on.
		requestAnimationFrame(() => {
			if (document.activeElement === document.body) document.querySelector<HTMLButtonElement>(`.shop-card[data-skin="${skin}"]`)?.focus({ preventScroll: true })
		})
	}
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
	const header = student ? <PointsPill value={state.points + landed} counting={landed !== 0} pill={pill} /> : null
	return <LibraryShell title="Tienda" view="shop" folders={library?.folders ?? []} onViewChange={(view) => navigate(boardViewPath(view))} onBack={() => navigate('/')} actions={header} testId="portal-shop">
		<div className="shop" aria-busy={!state}>
			{loadError && !state && <p className="xp-error shop-alert" role="alert">{loadError} <button className="portal-link" onClick={() => void load()}>Reintentar</button></p>}
			{!state && !loadError && <ShopSkeleton />}
			{state && <>
				{notice && <p className="shop-toast" role="alert" key={notice}>{notice}</p>}
				<section className="shop-hero" ref={hero}>
					<div className="shop-machine-frame"><ShopMachine state={state} pending={pending} reveal={reveal} onSpin={(free) => void spin(free)} /></div>
					<Ticket state={state} hero={hero} starting={starting} onReview={startReview} onAnswer={answer} onGraded={graded} onRetry={review} />
				</section>
				<section className="shop-cards" aria-labelledby="shop-cards-title">
					<div className="shop-cards__heading">
						<h2 id="shop-cards-title">Cartas de hoy</h2>
						<p className="shop-countdown" data-testid="shop-countdown">cambian en {countdown(state.rotatesAt - now)}</p>
					</div>
					{/* Programmatic scrolls can still move an `overflow-y: hidden` box; the row only ever scrolls sideways. */}
					<motion.ul className="shop-row" key={state.day} layoutScroll data-locked={locks > 0 || undefined} onScroll={(event) => { if (event.currentTarget.scrollTop) event.currentTarget.scrollTop = 0 }}>
						{state.pool.map((skin, i) => <li key={skin} data-slot={skin} style={{ '--i': i } as CSSProperties}>
							<ShopCard skin={skin} state={state} fresh={fresh.includes(skin)} open={detail === skin || flying.includes(skin)}
								onReveal={(card, element) => void turnCard(card, element)} onOpen={setDetail} onFlashed={() => setFresh((current) => current.filter((item) => item !== skin))} />
						</li>)}
						<li className="shop-gift-slot" style={{ '--i': state.pool.length } as CSSProperties}>
							<GiftTicket gift={state.gift} teacher={state.teacher} claiming={claiming} coins={coins} onClaim={() => void claimGift()} />
						</li>
					</motion.ul>
				</section>
			</>}
		</div>
		{reveal && <GachaponReveal result={reveal} />}
		<AnimatePresence mode="sync">{detail && state && <CardDetail key={detail} skin={detail} state={state} onBuy={buy} onClose={() => closeDetail(detail)} onLanded={() => cardHome(detail)} />}</AnimatePresence>
	</LibraryShell>
}

/** The ticket hosts the review below its perforation, so the free spin is earned where it is shown. */
function Ticket({ state, hero, starting, onReview, onAnswer, onGraded, onRetry }: {
	state: ShopState; hero: RefObject<HTMLElement | null>; starting: boolean; onReview: () => Promise<boolean>
	onAnswer: (review: ShopReview, index: number, answer: number) => Promise<ShopAnswer>; onGraded: (result: ShopAnswer) => void; onRetry: () => Promise<void>
}) {
	const { freeSpin, review } = state
	const [graded, setGraded] = useState<ShopAnswer | null>(null), [open, setOpen] = useState(false)
	// The rain falls inside the gachapon panel, measured as it starts.
	const [celebration, setCelebration] = useState<{ id: string; height: number } | null>(null)
	const ticket = useRef<HTMLElement>(null)
	const view = graded ? (graded.passed ? 'passed' : 'failed') : !state.teacher && open && review.active ? 'quiz' : 'free'
	useEffect(() => {
		if (view !== 'passed') return
		const timer = setTimeout(() => setGraded(null), 4000)
		return () => clearTimeout(timer)
	}, [view])
	// One rain at a time; it outlives the question it celebrates.
	useEffect(() => {
		if (!celebration) return
		const timer = setTimeout(() => setCelebration(null), 2500)
		return () => clearTimeout(timer)
	}, [celebration])
	// Opening the quiz brings the whole ticket into view.
	useEffect(() => {
		if (view === 'quiz') ticket.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
	}, [view, review.active?.id])
	function finish(result: ShopAnswer) {
		setGraded(result)
		setOpen(false)
		onGraded(result)
		if (result.passed) playCelebrate()
	}
	async function retry() {
		await onRetry()
		setGraded(null); setOpen(true)
	}
	async function start() {
		if (await onReview()) setOpen(true)
	}

	const free = state.teacher ? <p className="shop-ticket__note">Los alumnos ganan una tirada gratis al repasar 3 preguntas.</p>
		: freeSpin === 'available' ? <span className="shop-free-token"><i aria-hidden="true" />Tirada gratis lista</span>
		: freeSpin === 'used' ? <button className="shop-button" disabled>¡Vuelve mañana!</button>
		: review.active ? <button className="shop-button" onClick={() => setOpen(true)}>Continuar repaso</button>
		: review.attemptsLeft ? <button className="shop-button" disabled={starting} onClick={() => void start()}>{starting ? 'Preparando…' : 'Repasar 3 preguntas'}</button>
		: <button className="shop-button" disabled>¡Vuelve mañana!</button>
	return <section className="shop-ticket" ref={ticket} aria-labelledby="shop-ticket-title" onClick={() => { if (view === 'passed') setGraded(null) }}>
		<h2 id="shop-ticket-title" className="shop-ticket__title">¡Repasa los conceptos de clase y gana una tirada! :)</h2>
		<div className="shop-ticket__free" data-state={state.teacher ? 'preview' : freeSpin} data-testid="shop-free-spin">
			<div className="shop-ticket__step" data-view={view} key={view}>
				{view === 'quiz' && review.active ? <Quiz key={review.active.id} review={review.active} onClose={() => setOpen(false)}
					onAnswer={(index, answer) => onAnswer(review.active!, index, answer)} onCorrect={(id) => setCelebration({ id, height: hero.current?.clientHeight ?? 0 })} onDone={finish} />
					: view === 'passed' ? <Passed />
					: view === 'failed' && graded ? <Failed result={graded} onRetry={retry} onDone={() => { setGraded(null); setOpen(false) }} />
					: free}
			</div>
		</div>
		{celebration && hero.current && createPortal(<Celebration key={celebration.id} id={celebration.id} height={celebration.height} />, hero.current)}
	</section>
}

const LETTERS = 'ABCD'
const attempts = (count: number) => count === 1 ? 'Te queda 1 intento hoy.' : `Te quedan ${count} intentos hoy.`
/** How long a graded answer stays on screen before the next question. */
const ADVANCE_MS = 1300

/** One question at a time, graded as soon as it is answered. The server keeps each key until then. */
function Quiz({ review, onClose, onAnswer, onCorrect, onDone }: {
	review: ShopReview; onClose: () => void
	onAnswer: (index: number, answer: number) => Promise<ShopAnswer>; onCorrect: (id: string) => void; onDone: (result: ShopAnswer) => void
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
			<p className="shop-review__count">Pregunta {index + 1} de {review.questions.length}</p>
			<h3 ref={heading} tabIndex={-1} className="shop-review__question">{question.question}</h3>
			<div className="shop-review__answers" role="group" aria-label="Respuestas" data-shake={shake || undefined}>
				{question.answers.map((answer, i) => <button key={i} className="shop-review__answer" aria-pressed={(result?.answer ?? picked) === i} data-result={mark(i)}
					disabled={picked !== null || !!result} onClick={() => void choose(i)}>
					<span aria-hidden="true">{LETTERS[i]}</span>{answer}
				</button>)}
			</div>
		</div>
		{error && <p className="xp-error" role="alert">{error}</p>}
		<div className="shop-review__footer">
			<button className="shop-review__close" disabled={picked !== null} onClick={onClose}>Cerrar</button>
		</div>
	</div>
}

/** Moves focus to a result's heading, so keyboard and screen reader users hear it. */
function useFocused() {
	const heading = useRef<HTMLHeadingElement>(null)
	useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
	return heading
}

function Passed() {
	const heading = useFocused()
	return <div className="shop-review__result" data-passed="true">
		<div className="shop-review__token" aria-hidden="true"><span>XP</span></div>
		<h3 ref={heading} tabIndex={-1}>Tirada gratis lista</h3>
		<p>Jala la palanca de la máquina</p>
	</div>
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
	return <p className="shop-points" ref={pill} aria-live="polite">
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

const CARD_BACK = <div className="shop-card-back"><span className="shop-card-back__emblem">XP</span><span className="shop-card-back__ribbon">Nuevo</span></div>

/** The shared-element morph between a card's slot and the detail, as one card moving rather than a copy. */
const MORPH = { type: 'spring', stiffness: 260, damping: 30 } as const
const morphId = (skin: RewardSkin) => `shop-card-${skin}`

/**
 * The profile card in its shop dress, with the same tilt, lamp and foil. Face down it is a "Revelar carta" button;
 * face up it opens the card's detail, where it is bought. While the detail is open the card is there, and its slot stays empty.
 */
function ShopCard({ skin, state, fresh, open, onReveal, onOpen, onFlashed }: {
	skin: RewardSkin; state: ShopState; fresh: boolean; open: boolean
	onReveal: (skin: RewardSkin, card: HTMLElement) => void; onOpen: (skin: RewardSkin) => void; onFlashed: () => void
}) {
	const art = skins.find((item) => item.id === skin)!
	const draft = useMemo(() => shopDraft(skin), [skin])
	const reduced = usePassReducedMotion()
	const revealed = state.revealed.includes(skin), owned = state.owned.includes(skin)
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
		if (mode === 'view') { onOpen(skin); return }
		// The overlay is inert while the card turns, so a keyboard reveal gets its focus back afterwards.
		const focused = document.activeElement === button.current
		onReveal(skin, stage.current!)
		if (focused) refocus(FLIP_MS, 12)
	}
	const slot = { 'data-open': open, 'data-revealed': revealed, 'data-owned': revealed && owned, 'data-mode': mode, style: { '--card-color': art.color } as CSSProperties }
	if (open) return <div className="shop-card-slot" {...slot} />
	const actions = <button ref={button} className="shop-card" data-mode={mode} data-owned={owned} data-skin={skin} aria-label={revealed ? `Ver ${art.name}` : 'Revelar carta'} onClick={press} />
	return <div className="shop-card-slot" {...slot}>
		<div className="shop-card-stage" ref={stage}>
			<motion.div layoutId={reduced ? undefined : morphId(skin)} layout={!reduced} transition={MORPH} style={{ borderRadius: 17 }}>
				<PassCard draft={draft} variant="shop" back={!revealed} backFace={CARD_BACK} actions={actions} />
			</motion.div>
			{/* The flash reaches past the card, so it leaves once it fades; left behind, it let the row scroll vertically. */}
			{fresh && <span className="shop-burst" aria-hidden="true" onAnimationEnd={onFlashed}><b /></span>}
		</div>
	</div>
}

type BuyMode = 'buy' | 'confirm' | 'busy' | 'short' | 'owned' | 'preview'
/** The veil, the name, the button and the close button fade in, and out as the card heads home. */
const fade = (leaving: boolean) => ({ initial: { opacity: 0 }, animate: { opacity: leaving ? 0 : 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } })

/**
 * A face-up card at full size: the row card itself grows to the centre and goes back on close. The first tap asks, the second buys.
 * It is a hand-made modal because a dialog portal mounts a render late, and the morph needs both ends in the same commit.
 */
function CardDetail({ skin, state, onBuy, onClose, onLanded }: {
	skin: RewardSkin; state: ShopState; onBuy: (skin: RewardSkin) => Promise<boolean>; onClose: () => void; onLanded: () => void
}) {
	// Closing removes the detail at once; it stays mounted, inert, only while the card flies home.
	const [present, safeToRemove] = usePresence()
	const leaving = !present
	const art = skins.find((item) => item.id === skin)!
	const draft = useMemo(() => shopDraft(skin), [skin])
	const reduced = usePassReducedMotion()
	const owned = state.owned.includes(skin), missing = state.cardCost - state.points
	const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false)
	const root = useRef<HTMLDivElement>(null), buyButton = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null)
	const title = useId()
	// On close the card flies back to its slot here, above the row's clipping, then hands over to the slot card in place.
	const [home, setHome] = useState<DOMRect | null>(null)
	const mode: BuyMode = owned ? 'owned' : state.teacher ? 'preview' : busy ? 'busy' : missing > 0 ? 'short' : confirming ? 'confirm' : 'buy'
	const enabled = mode === 'buy' || mode === 'confirm'
	useEffect(() => {
		if (!confirming) return
		const timer = setTimeout(() => setConfirming(false), 4000)
		return () => clearTimeout(timer)
	}, [confirming])
	useEffect(() => { (enabled ? buyButton : close).current?.focus({ preventScroll: true }) }, [])
	const price = points(state.cardCost)

	const land = useRef<() => void>(undefined)
	useLayoutEffect(() => {
		if (present) return
		let done = false
		land.current = () => { if (!done) { done = true; safeToRemove?.(); onLanded() } }
		const slot = document.querySelector(`[data-slot="${skin}"]`)?.getBoundingClientRect()
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
		// The button turns into a disabled "Ya la tienes", so focus moves to the next useful control.
		if (success) close.current?.focus()
	}
	const label = mode === 'buy' ? <><span className="shop-coin" aria-hidden="true" />Comprar · {price}</> : mode === 'confirm' ? `Confirmar · ${price}` : mode === 'busy' ? 'Comprando…'
		: mode === 'owned' ? 'Ya la tienes' : mode === 'short' ? `Te faltan ${points(missing)} puntos` : `${price} puntos`

	return createPortal(<div className="shop-detail" ref={root} role="dialog" aria-modal="true" aria-labelledby={title} data-leaving={leaving} inert={leaving} onKeyDown={keys}>
		<motion.div className="shop-detail-overlay" {...fade(leaving)} onClick={dismiss} />
		<div className="shop-detail__content" data-testid="shop-card-detail" onClick={(event) => { if (event.target === event.currentTarget) dismiss() }}>
			<div className="shop-detail__frame">
				<motion.div className="shop-detail__card" layoutId={reduced ? undefined : morphId(skin)} layout={!reduced} transition={MORPH}
					style={{ borderRadius: 17, '--card-color': art.color, ...(home && { position: 'fixed', left: home.left, top: home.top, width: home.width }) } as CSSProperties}
					onLayoutAnimationComplete={() => { if (home) land.current?.() }}>
					<PassCard draft={draft} variant="shop" />
				</motion.div>
			</div>
			<motion.div className="shop-detail__text" {...fade(leaving)}>
				<h2 className="shop-detail__name" id={title}>{art.name}</h2>
				<button ref={buyButton} className="shop-detail__buy" data-mode={mode} disabled={!enabled} onClick={() => void press()}>{label}</button>
			</motion.div>
		</div>
		<motion.button className="xp-icon-button shop-detail__close" aria-label="Cerrar" ref={close} onClick={dismiss} {...fade(leaving)}><Icon name="close" /></motion.button>
	</div>, document.body)
}

function ShopSkeleton() {
	return <div className="shop-skeleton" role="status" aria-label="Abriendo la tienda">
		<div className="shop-hero"><div className="shop-skeleton__block shop-skeleton__machine" /><div className="shop-skeleton__block shop-skeleton__ticket" /></div>
		<ul className="shop-row">{Array.from({ length: 7 }, (_, i) => <li key={i}><div className="shop-skeleton__block shop-skeleton__card" /></li>)}</ul>
	</div>
}
