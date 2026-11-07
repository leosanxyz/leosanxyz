import { describe, expect, it } from 'vitest'
import { sectionTitle } from '../../shared/obs'
import { findSections as find, type SectionCandidate } from './sections'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const findSections = (shapes: (Omit<SectionCandidate, 'title'> & { text: string })[]) => find(shapes.map((shape) => ({ ...shape, title: sectionTitle(shape.text) })))

describe('section blocks', () => {
	it('attaches a loose title to the smallest rectangle around it', () => {
		const sections = findSections([
			{ id: 'page', type: 'geo', text: '', bounds: box(0, 0, 2000, 2000) },
			{ id: 'block', type: 'geo', text: '', bounds: box(50, 60, 810, 260) },
			{ id: 'card', type: 'geo', text: 'pídeselo a Codex', bounds: box(80, 150, 360, 140) },
			{ id: 'title', type: 'text', text: '1 · haz el primer paso de tu plan', bounds: box(80, 90, 580, 40) },
			{ id: 'subtitle', type: 'text', text: 'el paso 1 de tu plan, sin skill', bounds: box(180, 220, 200, 50) },
		])
		expect(sections).toEqual([{ id: 'block', title: 'haz el primer paso de tu plan', bounds: box(50, 60, 810, 260) }])
	})
	it('uses the rectangle or frame itself when the title is its own text', () => {
		expect(findSections([
			{ id: 'geo', type: 'geo', text: '2 · juega', bounds: box(0, 0, 100, 100) },
			{ id: 'frame', type: 'frame', text: '3·repaso', bounds: box(200, 0, 100, 100) },
			{ id: 'note', type: 'note', text: '4 · nota', bounds: box(400, 0, 100, 100) },
		]).map((section) => [section.id, section.title])).toEqual([['geo', 'juega'], ['frame', 'repaso']])
	})
	it('gives a block one title, the highest, so a numbered list inside it is not a chapter', () => {
		expect(findSections([
			{ id: 'block', type: 'geo', text: '', bounds: box(0, 0, 400, 400) },
			{ id: 'step1', type: 'text', text: '1 · escribe lo que repites a mano', bounds: box(10, 80, 300, 20) },
			{ id: 'title', type: 'text', text: '4 · en orden', bounds: box(10, 10, 300, 30) },
			{ id: 'step5', type: 'text', text: '5 · pruébalo en Unity', bounds: box(10, 300, 300, 20) },
			{ id: 'own', type: 'geo', text: '2 · juega', bounds: box(500, 0, 400, 400) },
			{ id: 'inside', type: 'text', text: '1 · primero', bounds: box(510, 10, 300, 20) },
		]).map((section) => [section.id, section.title])).toEqual([['block', 'en orden'], ['own', 'juega']])
	})
	it('falls back to the text when nothing surrounds it', () => {
		expect(findSections([{ id: 't', type: 'text', text: '5 · suelto', bounds: box(0, 0, 10, 10) }])[0].id).toBe('t')
	})
})
