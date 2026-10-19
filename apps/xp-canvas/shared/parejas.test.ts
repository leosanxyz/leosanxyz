import { describe, expect, it } from 'vitest'
import { drawPair, pairLabel, parejasShapeProps, remainingParticipants } from './parejasShape'

const people = ['ana', 'beto', 'caro', 'dani', 'eva'].map((id) => ({ id, name: id }))
const sequence = (...values: number[]) => () => values.shift() ?? 0

describe('parejas', () => {
	it('draws two, all three when three remain, and the last one alone', () => {
		expect(drawPair(people, sequence(0.99, 0))).toEqual([people[4], people[1]])
		expect(drawPair(people.slice(0, 3), Math.random)).toHaveLength(3)
		expect(new Set(drawPair(people.slice(0, 3), Math.random).map((p) => p.id))).toEqual(new Set(['ana', 'beto', 'caro']))
		expect(drawPair(people.slice(0, 1), Math.random)).toEqual([people[0]])
		expect(drawPair([], Math.random)).toEqual([])
	})

	it('keeps those without a pair in their original order', () => {
		expect(remainingParticipants(people, [['dani', 'ana']]).map((p) => p.id)).toEqual(['beto', 'caro', 'eva'])
		expect(remainingParticipants(people, [['dani', 'ana'], ['beto', 'caro', 'eva']])).toEqual([])
	})

	it('names a pair the way people say it', () => {
		expect(pairLabel(['Ana', 'Beto'])).toBe('Ana y Beto')
		expect(pairLabel(['Ana', 'Beto', 'Caro'])).toBe('Ana, Beto y Caro')
		expect(pairLabel(['Ana'])).toBe('Ana')
	})

	it('rejects someone in two pairs', () => {
		expect(() => parejasShapeProps.pairs.validate([['ana', 'beto'], ['caro', 'dani']])).not.toThrow()
		expect(() => parejasShapeProps.pairs.validate([['ana', 'beto'], ['beto', 'caro']])).toThrow()
		expect(() => parejasShapeProps.pairs.validate([['ana', 'beto', 'caro', 'dani']])).toThrow()
	})
})
