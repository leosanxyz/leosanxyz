import { describe, expect, it } from 'vitest'
import { sectionNumber } from '../../shared/obs'
import { findSections as find, type SectionCandidate } from './sections'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const findSections = (shapes: (Omit<SectionCandidate, 'number'> & { text: string })[]) => find(shapes.map((shape) => ({ ...shape, number: sectionNumber(shape.text) })))

describe('section blocks', () => {
	it('attaches a loose title to the smallest rectangle around it', () => {
		const sections = findSections([
			{ id: 'page', type: 'geo', text: '', bounds: box(0, 0, 2000, 2000) },
			{ id: 'block', type: 'geo', text: '', bounds: box(50, 60, 810, 260) },
			{ id: 'card', type: 'geo', text: 'pídeselo a Codex', bounds: box(80, 150, 360, 140) },
			{ id: 'title', type: 'text', text: '1 · haz el primer paso de tu plan', bounds: box(80, 90, 580, 40) },
			{ id: 'subtitle', type: 'text', text: 'el paso 1 de tu plan, sin skill', bounds: box(180, 220, 200, 50) },
		])
		expect(sections).toEqual([{ id: 'block', number: 1, bounds: box(50, 60, 810, 260) }])
	})
	it('uses the rectangle or frame itself when the title is its own text', () => {
		expect(findSections([
			{ id: 'geo', type: 'geo', text: '2 · juega', bounds: box(0, 0, 100, 100) },
			{ id: 'frame', type: 'frame', text: '3·repaso', bounds: box(200, 0, 100, 100) },
			{ id: 'note', type: 'note', text: '4 · nota', bounds: box(400, 0, 100, 100) },
		]).map((section) => [section.id, section.number])).toEqual([['geo', 2], ['frame', 3]])
	})
	it('falls back to the text when nothing surrounds it', () => {
		expect(findSections([{ id: 't', type: 'text', text: '5 · suelto', bounds: box(0, 0, 10, 10) }])[0].id).toBe('t')
	})
})
