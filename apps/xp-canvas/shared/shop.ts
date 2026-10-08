import { REWARD_SKINS, type RewardSkin } from './pass'
import type { GachaponResult } from './gachaponShape'

export const SHOP_SPIN_COST = 150
export const SHOP_CARD_COST = 300
export const SHOP_POOL_SIZE = 6
export const SHOP_REVIEW_QUESTIONS = 3
export const SHOP_REVIEW_ATTEMPTS = 3
export const SHOP_REVEAL_POINTS = 5
export const SHOP_GIFT_POINTS = 25
export const SHOP_GIFT_STREAK_POINTS = 50
export const SHOP_GIFT_STREAK_DAYS = 5
export const SHOP_ROTATION_HOURS = 6

// Mexico has no daylight saving time since 2022, so every shop day lasts exactly 24 h and every rotation 6 h.
const TIME_ZONE = 'America/Mexico_City'
const DAY_MS = 24 * 60 * 60 * 1000
const ROTATION_MS = SHOP_ROTATION_HOURS * 60 * 60 * 1000
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** `YYYY-MM-DD` of the shop day in Mexico City. */
export const shopDay = (now = Date.now()) => dayFormat.format(now)

const clock = (now: number) => Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, Number(part.value)]))

/** `YYYY-MM-DD/n`: the pool's rotation, the n-th six hours of the shop day (0–3). */
export const shopSlot = (now = Date.now()) => `${shopDay(now)}/${Math.floor(clock(now).hour / SHOP_ROTATION_HOURS)}`

/** Epoch ms of the next rotation, every six hours from Mexico City midnight. */
export function nextShopRotation(now = Date.now()) {
	const parts = clock(now)
	const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + (((now % 1000) + 1000) % 1000)
	return now - elapsed % ROTATION_MS + ROTATION_MS
}

/** The day before a `YYYY-MM-DD` shop day. */
const previousDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10)

/** Consecutive days with a claimed gift, ending today or yesterday. A missed day starts over. */
export function giftStreak(days: string[], today: string) {
	const claimed = new Set(days)
	let day = claimed.has(today) ? today : previousDay(today), streak = 0
	while (claimed.has(day)) { streak++; day = previousDay(day) }
	return streak
}

/** What a gift pays when it is the `streak`-th day in a row. */
export const giftAmount = (streak: number) => streak >= SHOP_GIFT_STREAK_DAYS ? SHOP_GIFT_STREAK_POINTS : SHOP_GIFT_POINTS

/** The catalog shuffled the same way for everyone with the same seed: FNV-1a seeds mulberry32. */
function shuffled(seed: string, cards: readonly RewardSkin[]): RewardSkin[] {
	let state = 0x811c9dc5
	for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193) >>> 0
	const random = () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const result = [...cards]
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

/** The machine's six prizes for a shop day. */
export const gachaPool = (day: string) => shuffled(day, REWARD_SKINS).slice(0, SHOP_POOL_SIZE)

/** The six cards for sale in a rotation, never one of that day's machine prizes. */
export function shopPool(slot: string): RewardSkin[] {
	const machine = gachaPool(slot.split('/')[0])
	return shuffled(slot, REWARD_SKINS.filter((skin) => !machine.includes(skin))).slice(0, SHOP_POOL_SIZE)
}

/** A review question without its key. The correct index stays on the server until grading. */
export type ShopQuestion = { question: string; answers: string[] }
/** A graded answer: what the student chose and the right option, revealed once answered. */
export type ShopResult = { answer: number; correct: boolean; right: number }
/** `results` follows the questions; `null` is still unanswered, so a reload resumes where the student left. */
export type ShopReview = { id: string; questions: ShopQuestion[]; results: (ShopResult | null)[] }
export type FreeSpinState = 'locked' | 'available' | 'used'
/** `streak` counts today once claimed; `amount` is what today's claim pays or paid. */
export interface ShopGift { claimed: boolean; amount: number; streak: number }
export interface ShopState {
	day: string
	/** The machine's prizes for the day, from `gachaPool`. */
	pool: RewardSkin[]
	/** The shop's rotation, from `shopSlot`. */
	slot: string
	/** The cards for sale in this rotation, from `shopPool`. */
	shop: RewardSkin[]
	/** When the cards for sale change next. */
	rotatesAt: number
	spinCost: number
	cardCost: number
	points: number
	owned: RewardSkin[]
	freeSpin: FreeSpinState
	review: { attemptsLeft: number; active: ShopReview | null }
	/** The cards for sale this student already turned over in this rotation. */
	revealed: RewardSkin[]
	gift: ShopGift
	teacher: boolean
}
/** One question graded at once. The third answer finishes the attempt: `done`, and `passed` stops being `null`. */
export interface ShopAnswer { index: number; correct: boolean; right: number; done: boolean; passed: boolean | null; freeSpin: FreeSpinState; attemptsLeft: number }
export type ShopSpin = GachaponResult & { points: number }
export interface ShopPurchase { skin: RewardSkin; points: number }
export interface ShopReveal { revealed: RewardSkin[]; points: number }
export interface ShopGiftClaim { gift: ShopGift; points: number }
