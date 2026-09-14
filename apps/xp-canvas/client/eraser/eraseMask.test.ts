import { describe, expect, it } from 'vitest'
import { coversBounds, getEraseMask, isErased, maskPaths, maskTransform, type EraseFrame, type EraseMask } from './eraseMask'
import type { TLShape } from 'tldraw'

const frame: EraseFrame = { x: 0, y: 0, w: 100, h: 100, flipX: false, flipY: false }
const mask: EraseMask = { version: 1, frame, strokes: [{ radius: 10, frame, points: [[25, 0], [25, 100]] }] }

describe('area eraser masks', () => {
	it('cuts the swept circle including the endpoints, not the surrounding ink', () => {
		expect(isErased({ x: 25, y: -9 }, mask)).toBe(true)
		expect(isErased({ x: 34, y: 50 }, mask)).toBe(true)
		expect(isErased({ x: 36, y: 50 }, mask)).toBe(false)
	})
	it('follows nonuniform resize and flip while preserving the original points', () => {
		const next = { ...frame, x: 100, w: 200, h: 50, flipX: true }
		expect(maskTransform(frame, next)).toEqual({ sx: -2, sy: .5, tx: 300, ty: 0 })
		expect(isErased({ x: 250, y: 25 }, mask, next)).toBe(true)
		expect(isErased({ x: 150, y: 25 }, mask, next)).toBe(false)
		expect(mask.strokes[0].points).toEqual([[25, 0], [25, 100]])
	})
	it('allows a fresh circular cut after a nonuniform resize', () => {
		const next = { ...frame, w: 200, h: 50 }
		const combined = { ...mask, strokes: [...mask.strokes, { radius: 10, frame: next, points: [[100, 25]] }] }
		expect(isErased({ x: 109, y: 25 }, combined, next)).toBe(true)
		expect(isErased({ x: 100, y: 34 }, combined, next)).toBe(true)
		expect(isErased({ x: 112, y: 25 }, combined, next)).toBe(false)
	})
	it('only declares full coverage when every region is covered', () => {
		expect(coversBounds(mask, { x: 20, y: 5, w: 10, h: 90 })).toBe(true)
		expect(coversBounds(mask, frame)).toBe(false)
		const whole: EraseMask = { ...mask, strokes: [10, 25, 40, 55, 70, 85, 100].map(x => ({ radius: 13, frame, points: [[x, -15], [x, 115]] })) }
		expect(coversBounds(whole, frame)).toBe(true)
	})
	it('exports scaled paths and rejects malformed metadata', () => {
		expect(maskPaths(mask, frame, 2)[0].transform).toBe('matrix(0.5 0 0 0.5 0 0)')
		expect(getEraseMask({ meta: { eraseMask: mask } } as unknown as TLShape)).toBe(mask)
		expect(getEraseMask({ meta: { eraseMask: { ...mask, strokes: [{ radius: Infinity, points: [] }] } } } as unknown as TLShape)).toBeUndefined()
	})
})
