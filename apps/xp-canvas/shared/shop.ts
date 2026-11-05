import { isRewardSkin, REWARD_SKINS, type PassSkin, type RewardSkin } from './pass'
import type { GachaponResult } from './gachaponShape'
import { COSMETICS, cosmetic, forSale, RARITIES, type CosmeticId, type CosmeticKind, type Rarity } from './cosmetics'

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

/** A random stream that is the same for everyone with the same seed: FNV-1a seeds mulberry32. */
function seeded(seed: string) {
	let state = 0x811c9dc5
	for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193) >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function shuffled<T>(seed: string, items: readonly T[]): T[] {
	const random = seeded(seed), result = [...items]
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

/** What the machine and the shop hand out: a reward card or a cosmetic. Cosmetic ids carry their kind before a colon; cards never do. */
export type ShopPrize = RewardSkin | CosmeticId
/** Cards count as rare. */
export const prizeRarity = (prize: ShopPrize): Rarity => isRewardSkin(prize) ? 'rara' : cosmetic(prize)!.rarity
const ORDER: Record<Rarity, number> = { legendaria: 0, epica: 1, rara: 2, comun: 3 }
const byRarity = (a: ShopPrize, b: ShopPrize) => ORDER[prizeRarity(a)] - ORDER[prizeRarity(b)]

/** The cosmetics the shop hands out: everything for sale. Profile effects and the free basics stay out. */
const SOLD = COSMETICS.filter(forSale)
const sold = (rarity: Rarity, kinds?: readonly CosmeticKind[]) => SOLD.filter((item) => item.rarity === rarity && (!kinds || kinds.includes(item.kind))).map((item) => item.id)

/**
 * The machine's six prizes for a shop day, rarest first: always one legendary, one or two epics, two cards and
 * rare or common cosmetics for the rest, so a pool never runs out of covers for the pass.
 */
export function gachaPool(day: string): ShopPrize[] {
	const random = seeded(`machine/${day}`), epics = random() < 0.5 ? 1 : 2
	const cards = shuffled(day, REWARD_SKINS).slice(0, 2)
	const rest = shuffled(`${day}/rest`, [...sold('rara'), ...sold('comun')]).slice(0, SHOP_POOL_SIZE - 3 - epics)
	return [...shuffled(`${day}/legendaria`, sold('legendaria')).slice(0, 1), ...shuffled(`${day}/epica`, sold('epica')).slice(0, epics), ...cards, ...rest].sort(byRarity)
}

/** The six cards for sale in a rotation, never one of that day's machine prizes. */
export function shopPool(slot: string): RewardSkin[] {
	const machine = gachaPool(slot.split('/')[0])
	return shuffled(slot, REWARD_SKINS.filter((skin) => !machine.includes(skin))).slice(0, SHOP_POOL_SIZE)
}

/** The rows under the cards, each with its own part of the catalog. Profile effects come later. */
export const SHOP_ROWS = { effects: ['material', 'frame'], plates: ['plate'] } as const satisfies Record<string, readonly CosmeticKind[]>
export type ShopRow = keyof typeof SHOP_ROWS

/**
 * Six items of a row for a rotation. At most one legendary and one or two epics; the rest are rares and commons,
 * and no rarity puts more than half its catalog (rounded up) in the same row, so a rotation never shows a whole tier.
 * Unlike the cards, a row may share an item with the machine: there are too few plates to keep both rules.
 */
export function cosmeticRow(slot: string, row: ShopRow): CosmeticId[] {
	const seed = `${slot}/${row}`, random = seeded(seed)
	const tier = (rarity: Rarity) => { const catalog = sold(rarity, SHOP_ROWS[row]); return shuffled(`${seed}/${rarity}`, catalog).slice(0, Math.ceil(catalog.length / 2)) }
	const [common, rare, epic, legendary] = RARITIES.map(tier)
	const legends = legendary.length && random() < 0.5 ? 1 : 0
	// Without a legendary the row needs both epics: half the rares and commons of a kind may not fill four places.
	const epics = Math.min(legends && random() < 0.5 ? 1 : 2, epic.length)
	const rest = shuffled(`${seed}/rest`, [...rare, ...common]).slice(0, SHOP_POOL_SIZE - legends - epics)
	return shuffled(`${seed}/order`, [...legendary.slice(0, legends), ...epic.slice(0, epics), ...rest])
}

/** Chance of each rarity in a spin, out of 100. A rarity the student has completed in the pool hands its share to the others. */
export const SPIN_WEIGHTS: Record<Rarity, number> = { comun: 55, rara: 30, epica: 12, legendaria: 3 }

/** A spin among what the student does not have yet: first a rarity by its weight, then one of its prizes evenly. */
export function drawPrize(candidates: readonly ShopPrize[], random: () => number): ShopPrize {
	const tiers = RARITIES.map((rarity) => ({ rarity, prizes: candidates.filter((prize) => prizeRarity(prize) === rarity) })).filter((tier) => tier.prizes.length)
	let roll = random() * tiers.reduce((sum, tier) => sum + SPIN_WEIGHTS[tier.rarity], 0)
	const chosen = tiers.find((tier) => (roll -= SPIN_WEIGHTS[tier.rarity]) < 0) ?? tiers[tiers.length - 1]
	return chosen.prizes[Math.floor(random() * chosen.prizes.length)]
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
	pool: ShopPrize[]
	/** The shop's rotation, from `shopSlot`. */
	slot: string
	/** The cards for sale in this rotation, from `shopPool`. */
	shop: RewardSkin[]
	/** The rows under the cards in this rotation, from `cosmeticRow`. */
	effects: CosmeticId[]
	plates: CosmeticId[]
	/** When the rows change next. */
	rotatesAt: number
	spinCost: number
	cardCost: number
	points: number
	/** Reward cards the student has. */
	owned: RewardSkin[]
	/** Cosmetics the student bought or won. */
	cosmetics: CosmeticId[]
	/** The student's current cover, which the shop's materials and frames are shown on. */
	cover: PassSkin
	freeSpin: FreeSpinState
	review: { attemptsLeft: number; active: ShopReview | null }
	/** What this student already turned over in this rotation, in any row. */
	revealed: ShopPrize[]
	gift: ShopGift
	teacher: boolean
}
/** One question graded at once. The third answer finishes the attempt: `done`, and `passed` stops being `null`. */
export interface ShopAnswer { index: number; correct: boolean; right: number; done: boolean; passed: boolean | null; freeSpin: FreeSpinState; attemptsLeft: number }
/** A spin's result. Unlike the canvas machine's, its prize can be a cosmetic. */
export type ShopSpin = Omit<GachaponResult, 'skin'> & { skin: ShopPrize; points: number }
export interface ShopPurchase { skin: RewardSkin; points: number }
export interface ShopReveal { revealed: ShopPrize[]; points: number }
export interface ShopGiftClaim { gift: ShopGift; points: number }
