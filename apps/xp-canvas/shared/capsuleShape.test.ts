import { describe, expect, it } from 'vitest'
import { bonusFor, capsuleClosed, capsulePayouts, cleanReason, parseCapsuleCommand } from './capsuleShape'

describe('reparto de la cápsula', () => {
	it('divide el bote entre quienes acertaron en proporción a lo que pusieron', () => {
		// 9 a A (300), 4 a B (110), 1 a C (30): gana B con un bote de 640.
		const bets = [
			...Array.from({ length: 9 }, (_, i) => ({ outcome: 0, stake: i === 0 ? 100 : 25 })),
			{ outcome: 1, stake: 80 }, { outcome: 1, stake: 20 }, { outcome: 1, stake: 10 }, { outcome: 1, stake: 0 },
			{ outcome: 2, stake: 30 },
		]
		const { pot, rate, payouts } = capsulePayouts(bets, [300, 110, 30], 1)
		expect(pot).toBe(640)
		expect(rate).toBeCloseTo(5.818, 3)
		expect(payouts.map((p) => p.paid)).toEqual([465, 116, 58, 0])
	})
	it('deja el bote en la casa si nadie puso puntos en la salida ganadora', () => {
		const { rate, payouts } = capsulePayouts([{ outcome: 0, stake: 50 }, { outcome: 1, stake: 0 }], [50, 0], 1)
		expect(rate).toBe(0)
		expect(payouts).toEqual([{ bet: { outcome: 1, stake: 0 }, paid: 0 }])
	})
	it('premia la explicación con la apuesta por 1.5 y un piso de 25', () => {
		expect(bonusFor(80)).toBe(120)
		expect(bonusFor(50)).toBe(75)
		expect(bonusFor(10)).toBe(25)
		expect(bonusFor(0)).toBe(25)
	})
	it('se cierra sola a la hora de clase', () => {
		expect(capsuleClosed({ status: 'sealed', opensAt: 1000 }, 999)).toBe(false)
		expect(capsuleClosed({ status: 'sealed', opensAt: 1000 }, 1000)).toBe(true)
		expect(capsuleClosed({ status: 'draft', opensAt: 1000 }, 5000)).toBe(false)
	})
})

describe('comandos de la cápsula', () => {
	it('acepta una apuesta válida y limpia el porqué', () => {
		expect(parseCapsuleCommand({ action: 'capsule-bet', shapeId: 'shape:c', revision: 'r1', outcome: 1, stake: 80, reason: '  El rombo\n no tiene  salida ' }))
			.toEqual({ action: 'capsule-bet', shapeId: 'shape:c', revision: 'r1', outcome: 1, stake: 80, reason: 'El rombo no tiene salida' })
	})
	it('rechaza montos y salidas fuera de rango', () => {
		expect(parseCapsuleCommand({ action: 'capsule-bet', shapeId: 'shape:c', revision: 'r1', outcome: 1, stake: 101, reason: 'x' })).toBeNull()
		expect(parseCapsuleCommand({ action: 'capsule-bet', shapeId: 'shape:c', revision: 'r1', outcome: 4, stake: 10, reason: 'x' })).toBeNull()
		expect(parseCapsuleCommand({ action: 'capsule-bet', shapeId: 'shape:c', revision: 'r1', outcome: 0, stake: 10, reason: 'x'.repeat(141) })).toBeNull()
		expect(parseCapsuleCommand({ action: 'capsule-resolve', shapeId: 'shape:c', winner: -1 })).toBeNull()
		expect(parseCapsuleCommand({ action: 'capsule-draw', shapeId: 'nope' })).toBeNull()
	})
	it('reconoce las acciones del maestro', () => {
		expect(parseCapsuleCommand({ action: 'capsule-draw', shapeId: 'shape:c' })).toEqual({ action: 'capsule-draw', shapeId: 'shape:c' })
		expect(parseCapsuleCommand({ action: 'capsule-bonus', shapeId: 'shape:c', betId: 'b1' })).toEqual({ action: 'capsule-bonus', shapeId: 'shape:c', betId: 'b1' })
		expect(parseCapsuleCommand({ action: 'capsule-resolve', shapeId: 'shape:c', winner: 2 })).toEqual({ action: 'capsule-resolve', shapeId: 'shape:c', winner: 2 })
		expect(cleanReason(42)).toBeNull()
	})
})
