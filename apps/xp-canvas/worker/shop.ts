import type { CanvasEnv } from './access'
import { catalog } from './boards'
import { readPoints, savePointAward } from './points'
import { allowedBoardIds, portalDb, type AuthSession } from './portalAuth'
import { body, json, PortalError } from './portalHttp'
import type { BoardLibrary } from '../shared/boards'
import { isRewardSkin, type RewardSkin } from '../shared/pass'
import {
	gachaPool, giftAmount, giftStreak, nextShopRotation, SHOP_CARD_COST, SHOP_GIFT_POINTS, SHOP_REVEAL_POINTS, SHOP_REVIEW_ATTEMPTS, SHOP_REVIEW_QUESTIONS, SHOP_SPIN_COST, shopDay, shopPool, shopSlot,
	type FreeSpinState, type ShopGift, type ShopGiftClaim, type ShopAnswer, type ShopPurchase, type ShopQuestion, type ShopReveal, type ShopSpin, type ShopState,
} from '../shared/shop'

type StoredQuestion = ShopQuestion & { boardId: string; shapeId: string; revision: string; correct: number }
type ReviewRow = { id: string; questions_json: string; answers_json: string | null; passed: number; finished_at: number | null }
type Answers = (number | null)[]

const MAX_REVIEW_BOARDS = 40
const ID = /^[a-f0-9-]{36}$/
const balance = 'COALESCE((SELECT SUM(amount) FROM point_awards WHERE user_id = ?), 0) - COALESCE((SELECT SUM(cost) FROM gachapon_spins WHERE user_id = ?), 0)'
/** Answers so far, one slot per question. Rows from before per-question grading may hold `NULL`. */
const storedAnswers = (json: string | null): Answers => json ? JSON.parse(json) : Array(SHOP_REVIEW_QUESTIONS).fill(null)
const random = (below: number) => Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * below)

async function student(session: AuthSession, env: CanvasEnv, day: string) {
	const db = portalDb(env), userId = session.user.id
	const [points, owned, reviews, free] = await Promise.all([
		readPoints(env, userId),
		db.prepare('SELECT DISTINCT skin FROM gachapon_spins WHERE user_id = ?').bind(userId).all<{ skin: RewardSkin }>(),
		db.prepare('SELECT id, questions_json, answers_json, passed, finished_at FROM shop_reviews WHERE user_id = ? AND day = ? ORDER BY created_at').bind(userId, day).all<ReviewRow>(),
		db.prepare('SELECT 1 FROM gachapon_spins WHERE source_key = ?').bind(JSON.stringify(['shop-free', userId, day])).first(),
	])
	const freeSpin: FreeSpinState = free ? 'used' : reviews.results.some((row) => row.passed) ? 'available' : 'locked'
	return { points, owned: owned.results.map((row) => row.skin), reviews: reviews.results, freeSpin }
}

/** The cards for sale turned in this rotation, from their point awards `["shop-reveal", user, slot, skin]`. */
async function revealed(env: CanvasEnv, userId: string, slot: string) {
	const rows = await portalDb(env).prepare("SELECT json_extract(source_key, '$[3]') AS skin FROM point_awards WHERE user_id = ? AND activity_kind = 'shop-reveal' AND json_extract(source_key, '$[2]') = ?")
		.bind(userId, slot).all<{ skin: RewardSkin }>()
	return rows.results.map((row) => row.skin)
}

/** The streak comes from the latest gift awards `["shop-gift", user, day]`, so it needs no table of its own. */
async function gift(env: CanvasEnv, userId: string, day: string): Promise<ShopGift> {
	const rows = await portalDb(env).prepare("SELECT json_extract(source_key, '$[2]') AS day, amount FROM point_awards WHERE user_id = ? AND activity_kind = 'shop-gift' ORDER BY created_at DESC LIMIT 40")
		.bind(userId).all<{ day: string; amount: number }>()
	const today = rows.results.find((row) => row.day === day)
	const streak = giftStreak(rows.results.map((row) => row.day), day)
	return today ? { claimed: true, amount: today.amount, streak } : { claimed: false, amount: giftAmount(streak + 1), streak }
}

function reviewState(reviews: ReviewRow[], freeSpin: FreeSpinState) {
	const active = freeSpin === 'locked' ? reviews.find((row) => row.finished_at === null) : undefined
	if (!active) return { attemptsLeft: Math.max(0, SHOP_REVIEW_ATTEMPTS - reviews.length), active: null }
	const questions = JSON.parse(active.questions_json) as StoredQuestion[], answers = storedAnswers(active.answers_json)
	return {
		attemptsLeft: Math.max(0, SHOP_REVIEW_ATTEMPTS - reviews.length),
		active: {
			id: active.id,
			questions: questions.map(({ question, answers }) => ({ question, answers })),
			results: questions.map(({ correct }, i) => answers[i] === null ? null : { answer: answers[i], correct: answers[i] === correct, right: correct }),
		},
	}
}

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX')

/** Every question in the student's current classes, once per wording. */
async function collectQuestions(session: AuthSession, env: CanvasEnv): Promise<StoredQuestion[]> {
	const [allowed, library] = await Promise.all([
		allowedBoardIds(session, env),
		catalog(env).fetch('http://catalog/api/library').then((response) => response.json<BoardLibrary>()),
	])
	const boards = library.boards.filter((board) => !board.trashedAt && allowed.has(board.id)).slice(0, MAX_REVIEW_BOARDS)
	const lists = await Promise.all(boards.map(async (board) => (await env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(board.id)).listQuestions())
		.map(({ id, revision, question, answers, correct }) => ({ boardId: board.id, shapeId: id, revision, question, answers, correct }))))
	const seen = new Set<string>()
	return lists.flat().filter((question) => {
		const key = normalize(question.question)
		if (!key || question.answers.length !== 4 || question.answers.some((answer) => !answer.trim()) || seen.has(key)) return false
		seen.add(key)
		return true
	})
}

export async function handleShopRequest(request: Request, session: AuthSession, env: CanvasEnv, path: string, method: string): Promise<Response> {
	// The machine's prizes change daily; the cards for sale every six hours, never among the machine's.
	const now = Date.now(), day = shopDay(now), slot = shopSlot(now), pool = gachaPool(day), shop = shopPool(slot)
	const shared = { day, pool, slot, shop, rotatesAt: nextShopRotation(now), spinCost: SHOP_SPIN_COST, cardCost: SHOP_CARD_COST }
	if (session.user.role === 'teacher') {
		if (path === '/api/portal/shop' && method === 'GET') return json({
			...shared, points: 0, owned: [], freeSpin: 'locked', review: { attemptsLeft: 0, active: null },
			revealed: shop, gift: { claimed: true, amount: SHOP_GIFT_POINTS, streak: 0 }, teacher: true,
		} satisfies ShopState)
		throw new PortalError(403, 'Los alumnos compran aquí con sus puntos.')
	}
	if (!session.passCompleted) throw new PortalError(403, 'Termina tu bienvenida antes de entrar a la tienda.')
	const db = portalDb(env), user = session.user

	// Local QA only: wipes today's review attempts and free spin so the quiz can be tested again. Not built for production.
	if (import.meta.env.DEV && path === '/api/portal/shop/debug/reset-review' && method === 'POST') {
		await db.batch([
			db.prepare('DELETE FROM shop_reviews WHERE user_id = ? AND day = ?').bind(user.id, day),
			db.prepare('DELETE FROM gachapon_spins WHERE source_key = ?').bind(JSON.stringify(['shop-free', user.id, day])),
		])
		return json({ ok: true })
	}

	if (path === '/api/portal/shop' && method === 'GET') {
		const [{ points, owned, reviews, freeSpin }, turned, daily] = await Promise.all([student(session, env, day), revealed(env, user.id, slot), gift(env, user.id, day)])
		return json({ ...shared, points, owned, freeSpin, review: reviewState(reviews, freeSpin), revealed: turned, gift: daily, teacher: false } satisfies ShopState)
	}

	// Turning a card pays once: the award key repeats for a double tap.
	if (path === '/api/portal/shop/reveal' && method === 'POST') {
		const skin = (await body(request)).skin
		if (!isRewardSkin(skin) || !shop.includes(skin)) throw new PortalError(403, 'Esa carta no está en la tienda ahora.')
		await savePointAward(env, { sourceKey: JSON.stringify(['shop-reveal', user.id, slot, skin]), eventId: crypto.randomUUID(), userId: user.id, activityKind: 'shop-reveal', amount: SHOP_REVEAL_POINTS, createdAt: now })
		const [turned, points] = await Promise.all([revealed(env, user.id, slot), readPoints(env, user.id)])
		return json({ revealed: turned, points } satisfies ShopReveal)
	}

	if (path === '/api/portal/shop/gift' && method === 'POST') {
		const daily = await gift(env, user.id, day)
		if (daily.claimed) throw new PortalError(409, 'Ya abriste el regalo de hoy. Mañana hay otro.')
		const paid = await savePointAward(env, { sourceKey: JSON.stringify(['shop-gift', user.id, day]), eventId: crypto.randomUUID(), userId: user.id, activityKind: 'shop-gift', amount: daily.amount, createdAt: now })
		if (paid === null) throw new PortalError(409, 'Ya abriste el regalo de hoy. Mañana hay otro.')
		return json({ gift: { claimed: true, amount: paid, streak: daily.streak + 1 }, points: await readPoints(env, user.id) } satisfies ShopGiftClaim)
	}

	if (path === '/api/portal/shop/review' && method === 'POST') {
		const { reviews, freeSpin } = await student(session, env, day)
		if (freeSpin !== 'locked') throw new PortalError(409, freeSpin === 'used' ? 'Ya usaste tu tirada gratis de hoy.' : 'Ya tienes tu tirada gratis. Jala la palanca.')
		const active = reviewState(reviews, freeSpin).active
		if (active) return json(active)
		if (reviews.length >= SHOP_REVIEW_ATTEMPTS) throw new PortalError(409, 'Ya usaste tus intentos de hoy. Mañana hay más.')
		const questions = await collectQuestions(session, env)
		if (questions.length < SHOP_REVIEW_QUESTIONS) throw new PortalError(409, 'Todavía no hay suficientes preguntas en tus clases. Vuelve cuando el maestro haya puesto más.')
		for (let i = 0; i < SHOP_REVIEW_QUESTIONS; i++) {
			const j = i + random(questions.length - i);
			[questions[i], questions[j]] = [questions[j], questions[i]]
		}
		const chosen = questions.slice(0, SHOP_REVIEW_QUESTIONS), id = crypto.randomUUID()
		const answers: Answers = Array(SHOP_REVIEW_QUESTIONS).fill(null)
		await db.prepare('INSERT INTO shop_reviews (id, user_id, day, questions_json, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user.id, day, JSON.stringify(chosen), JSON.stringify(answers), now).run()
		return json({ id, questions: chosen.map(({ question, answers }) => ({ question, answers })), results: answers }, 201)
	}

	// Each question is graded as soon as it is answered. The third answer finishes the attempt.
	const answer = /^\/api\/portal\/shop\/review\/([a-f0-9-]{36})\/answer$/.exec(path)
	if (answer && method === 'POST') {
		const data = await body(request), index = data.index, choice = data.answer
		if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= SHOP_REVIEW_QUESTIONS || typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice > 3) throw new PortalError(400, 'Solicitud inválida.')
		const row = await db.prepare('SELECT questions_json, answers_json FROM shop_reviews WHERE id = ? AND user_id = ? AND day = ? AND finished_at IS NULL').bind(answer[1], user.id, day).first<{ questions_json: string; answers_json: string | null }>()
		if (!row) throw new PortalError(409, 'Este repaso ya terminó. Empieza otro.')
		const questions = JSON.parse(row.questions_json) as StoredQuestion[], answers = storedAnswers(row.answers_json), right = questions[index].correct
		const reply = async (picked: number, done: boolean, passed: boolean | null) => {
			const { reviews, freeSpin } = await student(session, env, day)
			return json({ index, correct: picked === right, right, done, passed, freeSpin, attemptsLeft: reviewState(reviews, freeSpin).attemptsLeft } satisfies ShopAnswer)
		}
		// A repeated answer returns the first one, unchanged.
		const first = answers[index]
		if (first !== null) return reply(first, false, null)
		answers[index] = choice
		const done = answers.every((item) => item !== null), passed = done ? questions.every(({ correct }, i) => answers[i] === correct) : null
		// Writing only over the answers just read keeps two simultaneous answers from overwriting each other.
		const saved = await db.prepare('UPDATE shop_reviews SET answers_json = ?, passed = ?, finished_at = ? WHERE id = ? AND user_id = ? AND finished_at IS NULL AND answers_json IS ? RETURNING id')
			.bind(JSON.stringify(answers), Number(!!passed), done ? now : null, answer[1], user.id, row.answers_json).first()
		if (!saved) throw new PortalError(409, 'Este repaso ya terminó. Empieza otro.')
		return reply(choice, done, passed)
	}

	if (path === '/api/portal/shop/spin' && method === 'POST') {
		const data = await body(request)
		if (typeof data.spinId !== 'string' || !ID.test(data.spinId) || typeof data.free !== 'boolean') throw new PortalError(400, 'Solicitud inválida.')
		const { owned, freeSpin } = await student(session, env, day)
		const candidates = pool.filter((skin) => !owned.includes(skin))
		if (!candidates.length) throw new PortalError(409, 'Ya tienes todas las cartas de hoy.')
		const skin = candidates[random(candidates.length)]
		if (data.free && freeSpin !== 'available') throw new PortalError(409, freeSpin === 'used' ? 'Ya usaste tu tirada gratis de hoy.' : 'Primero repasa tres preguntas.')
		const cost = data.free ? 0 : SHOP_SPIN_COST
		const source = JSON.stringify(data.free ? ['shop-free', user.id, day] : ['shop-spin', user.id, data.spinId])
		// Like the canvas machine, the claim, the unlock and the charge are one D1 row, written only if the balance covers it.
		// The ownership check keeps two simultaneous spins from paying twice for the same card.
		const claimed = await db.prepare(`INSERT OR IGNORE INTO gachapon_spins (source_key, user_id, skin, created_at, cost)
			SELECT ?, ?, ?, ?, ? WHERE ? <= ${balance} AND NOT EXISTS (SELECT 1 FROM gachapon_spins WHERE user_id = ? AND skin = ?)
			RETURNING skin`).bind(source, user.id, skin, now, cost, cost, user.id, user.id, user.id, skin).first()
		if (!claimed) {
			if (await db.prepare('SELECT 1 FROM gachapon_spins WHERE source_key = ?').bind(source).first()) throw new PortalError(409, data.free ? 'Ya usaste tu tirada gratis de hoy.' : 'Esta tirada ya se registró.')
			if ((await readPoints(env, user.id)) < cost) throw new PortalError(409, `Necesitas ${SHOP_SPIN_COST} puntos para esta tirada.`)
			throw new PortalError(409, 'La tienda cambió. Vuelve a intentarlo.')
		}
		return json({ type: 'gachapon-result', id: data.spinId, shapeId: 'shop', userId: user.id, name: user.name, skin, startedAt: Date.now() + 150, points: await readPoints(env, user.id) } satisfies ShopSpin)
	}

	if (path === '/api/portal/shop/buy' && method === 'POST') {
		const skin = (await body(request)).skin
		if (!isRewardSkin(skin)) throw new PortalError(400, 'Esa carta no existe.')
		if (!shop.includes(skin)) throw new PortalError(403, 'Esa carta ya no está en la tienda ahora.')
		const claimed = await db.prepare(`INSERT OR IGNORE INTO gachapon_spins (source_key, user_id, skin, created_at, cost)
			SELECT ?, ?, ?, ?, ? WHERE ? <= ${balance} AND NOT EXISTS (SELECT 1 FROM gachapon_spins WHERE user_id = ? AND skin = ?)
			RETURNING skin`).bind(JSON.stringify(['shop-card', user.id, skin]), user.id, skin, now, SHOP_CARD_COST, SHOP_CARD_COST, user.id, user.id, user.id, skin).first()
		if (!claimed) {
			if (await db.prepare('SELECT 1 FROM gachapon_spins WHERE user_id = ? AND skin = ?').bind(user.id, skin).first()) throw new PortalError(409, 'Ya tienes esta carta.')
			throw new PortalError(409, `Necesitas ${SHOP_CARD_COST} puntos para esta carta.`)
		}
		return json({ skin, points: await readPoints(env, user.id) } satisfies ShopPurchase)
	}

	return json({ error: 'No encontrado.' }, 404)
}
