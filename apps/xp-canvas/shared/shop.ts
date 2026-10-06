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

// Mexico has no daylight saving time since 2022, so every shop day lasts exactly 24 h.
const TIME_ZONE = 'America/Mexico_City'
const DAY_MS = 24 * 60 * 60 * 1000
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** `YYYY-MM-DD` of the shop day in Mexico City. */
export const shopDay = (now = Date.now()) => dayFormat.format(now)

/** Epoch ms of the next Mexico City midnight, when the pool changes. */
export function nextShopRotation(now = Date.now()) {
	const parts = Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, Number(part.value)]))
	const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + (((now % 1000) + 1000) % 1000)
	return now - elapsed + DAY_MS
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

/** The same six cards for everyone on a given day: FNV-1a seeds mulberry32, which shuffles the catalog. */
export function shopPool(day: string): RewardSkin[] {
	let seed = 0x811c9dc5
	for (let i = 0; i < day.length; i++) seed = Math.imul(seed ^ day.charCodeAt(i), 0x01000193) >>> 0
	const random = () => {
		seed = (seed + 0x6d2b79f5) >>> 0
		let t = seed
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const cards = [...REWARD_SKINS]
	for (let i = cards.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[cards[i], cards[j]] = [cards[j], cards[i]]
	}
	return cards.slice(0, SHOP_POOL_SIZE)
}

/** A review question without its key. The correct index stays on the server until grading. */
export type ShopQuestion = { question: string; answers: string[] }
export type ShopReview = { id: string; questions: ShopQuestion[] }
export type FreeSpinState = 'locked' | 'available' | 'used'
/** `streak` counts today once claimed; `amount` is what today's claim pays or paid. */
export interface ShopGift { claimed: boolean; amount: number; streak: number }
export interface ShopState {
	day: string
	pool: RewardSkin[]
	rotatesAt: number
	spinCost: number
	cardCost: number
	points: number
	owned: RewardSkin[]
	freeSpin: FreeSpinState
	review: { attemptsLeft: number; active: ShopReview | null }
	/** Today's cards this student already turned over. */
	revealed: RewardSkin[]
	gift: ShopGift
	teacher: boolean
}
/** `answer` is the right option, revealed only after grading. */
export interface ShopGrade { passed: boolean; results: { correct: boolean; answer: number }[]; freeSpin: FreeSpinState; attemptsLeft: number }
export type ShopSpin = GachaponResult & { points: number }
export interface ShopPurchase { skin: RewardSkin; points: number }
export interface ShopReveal { revealed: RewardSkin[]; points: number }
export interface ShopGiftClaim { gift: ShopGift; points: number }
