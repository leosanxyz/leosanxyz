import type { TLRecord } from '@tldraw/tlschema'
import type { PortalUser } from '../shared/portal'
import { bonusFor, CAPSULE_BETS_MAX, capsuleClosed, capsulePayouts, type CapsuleBet, type CapsuleCommand, type CapsuleReply, type CapsuleShape } from '../shared/capsuleShape'
import type { PointAward } from './points'

type Store = { get(id: string): TLRecord | undefined; set(id: string, record: TLRecord): void }
export type CapsuleDeps = {
	sql: SqlStorage
	db: D1Database
	roomId: string
	transaction<T>(fn: (store: Store) => T): T
	/** Deja un premio en la cola durable del objeto; el envío a D1 ocurre aparte y se reintenta. */
	queueAward(award: PointAward): void
	/** Apuestas en curso por `shape:alumno`. Mientras una espera a D1, otra del mismo alumno no puede intercalarse. */
	busy: Set<string>
}
type BetRow = { id: string; shape_id: string; revision: string; user_id: string; name: string; outcome: number; stake: number; reason: string; created_at: number; drawn_at: number | null; bonus: number }
type Result = { status: number; body: CapsuleReply | { error: string } }

const denied = (status: number, error: string): Result => ({ status, body: { error } })
const toBet = (row: BetRow): CapsuleBet => ({ id: row.id, shapeId: row.shape_id, revision: row.revision, outcome: row.outcome, stake: row.stake, reason: row.reason, name: row.name, drawnAt: row.drawn_at, bonus: row.bonus })

function tables(sql: SqlStorage) {
	sql.exec('CREATE TABLE IF NOT EXISTS capsule_bets (id TEXT PRIMARY KEY, shape_id TEXT NOT NULL, revision TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, outcome INTEGER NOT NULL, stake INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, drawn_at INTEGER, bonus INTEGER NOT NULL DEFAULT 0, UNIQUE (shape_id, revision, user_id))')
	sql.exec('CREATE TABLE IF NOT EXISTS capsule_openings (shape_id TEXT PRIMARY KEY, revision TEXT NOT NULL, resolved_at INTEGER NOT NULL)')
}

function capsule(store: Store, shapeId: string) {
	const shape = store.get(shapeId)
	return shape && shape.typeName === 'shape' && shape.type === 'capsule' ? shape as CapsuleShape : null
}

/** Totales públicos por salida, recontados desde las apuestas guardadas. */
function totals(sql: SqlStorage, shape: CapsuleShape) {
	const counts = shape.props.outcomes.map(() => 0), stakes = shape.props.outcomes.map(() => 0)
	for (const row of sql.exec<{ outcome: number; n: number; total: number }>('SELECT outcome, COUNT(*) AS n, COALESCE(SUM(stake), 0) AS total FROM capsule_bets WHERE shape_id = ? AND revision = ? GROUP BY outcome', shape.id, shape.props.revision).toArray()) {
		if (row.outcome < counts.length) { counts[row.outcome] = row.n; stakes[row.outcome] = row.total }
	}
	return { counts, stakes }
}

/** Las apuestas de un alumno en este canvas, para que las vea al conectarse. */
export function myCapsuleBets(sql: SqlStorage, userId: string): CapsuleBet[] {
	tables(sql)
	return sql.exec<BetRow>('SELECT * FROM capsule_bets WHERE user_id = ?', userId).toArray().map((row) => ({ id: row.id, shapeId: row.shape_id, revision: row.revision, outcome: row.outcome, stake: row.stake, reason: row.reason, bonus: row.bonus }))
}

export async function handleCapsule(deps: CapsuleDeps, user: PortalUser, command: CapsuleCommand): Promise<Result> {
	tables(deps.sql)
	if (command.action === 'capsule-bet') return placeBet(deps, user, command)
	if (user.role !== 'teacher') return denied(403, 'Solo el maestro puede abrir la cápsula.')
	if (command.action === 'capsule-list') {
		const rows = deps.sql.exec<BetRow>('SELECT * FROM capsule_bets WHERE shape_id = ? ORDER BY updated_at', command.shapeId).toArray()
		return { status: 200, body: { type: 'capsule-bets', bets: rows.map(toBet) } }
	}
	if (command.action === 'capsule-draw') return drawBet(deps, command)
	if (command.action === 'capsule-bonus') return awardBonus(deps, command)
	return resolve(deps, command)
}

// La apuesta se cobra en D1 antes de guardarse aquí: el saldo es el mismo que gastan la tienda y el gachapon.
// Cambiar de apuesta reemplaza la fila; la comprobación de saldo excluye lo ya apostado en esta misma cápsula.
async function placeBet(deps: CapsuleDeps, user: PortalUser, command: Extract<CapsuleCommand, { action: 'capsule-bet' }>): Promise<Result> {
	if (user.role !== 'student') return denied(403, 'Solo los alumnos apuestan.')
	// El cobro en D1 y el registro aquí no son una sola transacción: dos cambios a la vez del mismo alumno podrían
	// confirmarse en distinto orden y dejar el saldo y la apuesta en desacuerdo. Uno a la vez.
	const key = `${command.shapeId}:${user.id}`
	if (deps.busy.has(key)) return denied(409, 'Espera un momento antes de cambiar la apuesta.')
	deps.busy.add(key)
	try { return await placeBetNow(deps, user, command) } finally { deps.busy.delete(key) }
}

async function placeBetNow(deps: CapsuleDeps, user: PortalUser, command: Extract<CapsuleCommand, { action: 'capsule-bet' }>): Promise<Result> {
	const check = (store: Store) => {
		const shape = capsule(store, command.shapeId)
		if (!shape) return 'Esta cápsula ya no existe.'
		if (shape.props.status === 'draft') return 'Leo todavía no sella la cápsula.'
		if (shape.props.status === 'resolved' || capsuleClosed(shape.props)) return 'La cápsula ya se cerró.'
		if (shape.props.revision !== command.revision) return 'La cápsula cambió. Vuelve a elegir.'
		if (command.outcome >= shape.props.outcomes.length) return 'Esa salida no existe.'
		return null
	}
	const early = deps.transaction(check)
	if (early) return denied(409, early)
	const existing = deps.sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM capsule_bets WHERE shape_id = ? AND revision = ?', command.shapeId, command.revision).one().total
	const mine = deps.sql.exec<BetRow>('SELECT * FROM capsule_bets WHERE shape_id = ? AND revision = ? AND user_id = ?', command.shapeId, command.revision, user.id).toArray()[0]
	if (!mine && existing >= CAPSULE_BETS_MAX) return denied(409, 'La cápsula está llena.')
	const source = JSON.stringify(['capsule', deps.roomId, command.shapeId, command.revision, user.id]), now = Date.now()
	const charged = await deps.db.prepare(`INSERT OR REPLACE INTO capsule_stakes (source_key, user_id, amount, created_at)
		SELECT ?, ?, ?, ? WHERE ? <= COALESCE((SELECT SUM(amount) FROM point_awards WHERE user_id = ?), 0) - COALESCE((SELECT SUM(cost) FROM gachapon_spins WHERE user_id = ?), 0) - COALESCE((SELECT SUM(amount) FROM capsule_stakes WHERE user_id = ? AND source_key != ?), 0) - COALESCE((SELECT SUM(cost) FROM cosmetics WHERE user_id = ?), 0)
		RETURNING amount`).bind(source, user.id, command.stake, now, command.stake, user.id, user.id, user.id, source, user.id).first()
	if (!charged) return denied(409, `Te faltan puntos para apostar ${command.stake}.`)
	const id = mine?.id ?? crypto.randomUUID()
	let bet: CapsuleBet | null = null
	const problem = deps.transaction((store) => {
		const late = check(store)
		if (late) return late
		deps.sql.exec('INSERT INTO capsule_bets (id, shape_id, revision, user_id, name, outcome, stake, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (shape_id, revision, user_id) DO UPDATE SET outcome = excluded.outcome, stake = excluded.stake, reason = excluded.reason, updated_at = excluded.updated_at',
			id, command.shapeId, command.revision, user.id, user.name, command.outcome, command.stake, command.reason, mine?.created_at ?? now, now)
		const shape = capsule(store, command.shapeId)!
		store.set(shape.id, { ...shape, props: { ...shape.props, ...totals(deps.sql, shape) } })
		bet = { id, shapeId: shape.id, revision: shape.props.revision, outcome: command.outcome, stake: command.stake, reason: command.reason }
		return null
	})
	if (problem || !bet) {
		// La cápsula se cerró entre el cobro y el registro: se devuelve lo cobrado, solo si la fila sigue siendo la de esta solicitud.
		await deps.db.prepare('UPDATE capsule_stakes SET amount = ? WHERE source_key = ? AND amount = ?').bind(mine?.stake ?? 0, source, command.stake).run()
		return denied(409, problem ?? 'No pude guardar la apuesta.')
	}
	return { status: 200, body: { type: 'capsule-bet', bet } }
}

// Sortea entre las apuestas con porqué que no se han leído. Quien leyó en la cápsula anterior descansa esta vez.
function drawBet(deps: CapsuleDeps, command: Extract<CapsuleCommand, { action: 'capsule-draw' }>): Result {
	let bet: BetRow | null = null
	const problem = deps.transaction((store) => {
		const shape = capsule(store, command.shapeId)
		if (!shape) return 'Esta cápsula ya no existe.'
		if (shape.props.status === 'draft') return 'Primero sella la cápsula.'
		const previous = deps.sql.exec<{ shape_id: string }>('SELECT shape_id FROM capsule_openings WHERE shape_id != ? ORDER BY resolved_at DESC LIMIT 1', shape.id).toArray()[0]
		const rested = previous ? deps.sql.exec<{ user_id: string }>('SELECT user_id FROM capsule_bets WHERE shape_id = ? AND drawn_at IS NOT NULL', previous.shape_id).toArray().map((row) => row.user_id) : []
		const rows = deps.sql.exec<BetRow>("SELECT * FROM capsule_bets WHERE shape_id = ? AND revision = ? AND drawn_at IS NULL AND reason != ''", shape.id, shape.props.revision).toArray()
		const eligible = rows.filter((row) => !rested.includes(row.user_id))
		const pool = eligible.length ? eligible : rows
		if (!pool.length) return 'No quedan apuestas por leer.'
		bet = pool[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * pool.length)]
		deps.sql.exec('UPDATE capsule_bets SET drawn_at = ? WHERE id = ?', Date.now(), bet.id)
		store.set(shape.id, { ...shape, props: { ...shape.props, read: Math.min(CAPSULE_BETS_MAX, shape.props.read + 1), drawnId: bet.id, drawnName: bet.name, drawnOutcome: bet.outcome, drawnStake: bet.stake, drawnReason: bet.reason, drawnBonus: 0 } })
		return null
	})
	if (problem || !bet) return denied(409, problem ?? 'No pude sortear.')
	return { status: 200, body: { type: 'capsule-bet', bet: toBet(bet) } }
}

function awardBonus(deps: CapsuleDeps, command: Extract<CapsuleCommand, { action: 'capsule-bonus' }>): Result {
	const problem = deps.transaction((store) => {
		const shape = capsule(store, command.shapeId)
		if (!shape) return 'Esta cápsula ya no existe.'
		const bet = deps.sql.exec<BetRow>('SELECT * FROM capsule_bets WHERE id = ? AND shape_id = ?', command.betId, shape.id).toArray()[0]
		if (!bet || bet.drawn_at === null) return 'Esa apuesta no ha salido en el sorteo.'
		if (bet.bonus > 0) return 'Esa explicación ya fue premiada.'
		const amount = bonusFor(bet.stake)
		deps.sql.exec('UPDATE capsule_bets SET bonus = ? WHERE id = ?', amount, bet.id)
		deps.queueAward({ sourceKey: JSON.stringify(['capsule-bonus', deps.roomId, shape.id, bet.revision, bet.user_id]), eventId: crypto.randomUUID(), userId: bet.user_id, activityKind: 'capsule-bonus', amount, createdAt: Date.now() })
		if (shape.props.drawnId === bet.id) store.set(shape.id, { ...shape, props: { ...shape.props, drawnBonus: amount } })
		return null
	})
	return problem ? denied(409, problem) : { status: 200, body: { type: 'capsule-done' } }
}

// Resolver reparte el bote de una vez y deja el reparto a la vista de todos. No se puede resolver dos veces.
function resolve(deps: CapsuleDeps, command: Extract<CapsuleCommand, { action: 'capsule-resolve' }>): Result {
	const problem = deps.transaction((store) => {
		const shape = capsule(store, command.shapeId)
		if (!shape) return 'Esta cápsula ya no existe.'
		if (shape.props.status === 'draft') return 'Primero sella la cápsula.'
		if (shape.props.status === 'resolved') return 'Esta cápsula ya se resolvió.'
		if (command.winner >= shape.props.outcomes.length) return 'Esa salida no existe.'
		const rows = deps.sql.exec<BetRow>('SELECT * FROM capsule_bets WHERE shape_id = ? AND revision = ?', shape.id, shape.props.revision).toArray()
		const { stakes, counts } = totals(deps.sql, shape)
		const { payouts } = capsulePayouts(rows, stakes, command.winner)
		const now = Date.now()
		for (const { bet, paid } of payouts) {
			if (paid > 0) deps.queueAward({ sourceKey: JSON.stringify(['capsule-win', deps.roomId, shape.id, shape.props.revision, bet.user_id]), eventId: crypto.randomUUID(), userId: bet.user_id, activityKind: 'capsule-win', amount: paid, createdAt: now })
		}
		deps.sql.exec('INSERT OR REPLACE INTO capsule_openings (shape_id, revision, resolved_at) VALUES (?, ?, ?)', shape.id, shape.props.revision, now)
		const listed = payouts.map(({ bet, paid }) => ({ name: bet.name, stake: bet.stake, paid })).sort((a, b) => b.paid - a.paid || b.stake - a.stake)
		store.set(shape.id, { ...shape, props: { ...shape.props, status: 'resolved', winner: command.winner, counts, stakes, payouts: listed, opensAt: Math.min(shape.props.opensAt, now) } })
		return null
	})
	return problem ? denied(409, problem) : { status: 200, body: { type: 'capsule-done' } }
}
