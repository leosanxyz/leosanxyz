import { describe, expect, it } from 'vitest'
import { unprojectCardPoint } from './cardProjection'

describe('stickers on a tilted pass', () => {
	it('maps the flat center without changing the card coordinates', () => {
		expect(
			unprojectCardPoint(
				200,
				200,
				{ left: 100, top: 50, width: 200, height: 300 },
				{
					m11: 1,
					m12: 0,
					m13: 0,
					m21: 0,
					m22: 1,
					m23: 0,
					m31: 0,
					m32: 0,
					m33: 1,
				},
				1100,
			),
		).toEqual({ x: 50, y: 50 })
	})
	it('recovers a pointer position after rotation and perspective', () => {
		const ax = (6 * Math.PI) / 180,
			ay = (-6 * Math.PI) / 180
		const m = {
			m11: Math.cos(ay),
			m12: Math.sin(ax) * Math.sin(ay),
			m13: -Math.cos(ax) * Math.sin(ay),
			m21: 0,
			m22: Math.cos(ax),
			m23: Math.sin(ax),
			m31: Math.sin(ay),
			m32: -Math.sin(ax) * Math.cos(ay),
			m33: Math.cos(ax) * Math.cos(ay),
		}
		const rect = { left: 80, top: 100, width: 280, height: 408 },
			u = -70,
			v = 102
		const depth = 1 - (m.m13 * u + m.m23 * v + m.m33) / 1100
		const x =
			rect.left + rect.width / 2 + (m.m11 * u + m.m21 * v + m.m31) / depth
		const y =
			rect.top + rect.height / 2 + (m.m12 * u + m.m22 * v + m.m32) / depth
		const point = unprojectCardPoint(x, y, rect, m, 1100)
		expect(point.x).toBeCloseTo(25, 6)
		expect(point.y).toBeCloseTo(75, 6)
	})
})
