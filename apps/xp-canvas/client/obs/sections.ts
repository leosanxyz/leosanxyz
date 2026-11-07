export interface Bounds { x: number; y: number; w: number; h: number }
/** `number` is the «N · …» title number of the shape's own text, if it has one (`sectionNumber`). */
export interface SectionCandidate { id: string; type: string; number: number | null; bounds: Bounds }
export interface Section { id: string; number: number; bounds: Bounds }

export const TITLED = new Set(['text', 'geo', 'frame'])
const contains = (outer: Bounds, inner: Bounds) =>
	inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

/**
 * A section block is whatever carries a «N · …» title: a rectangle or frame with that text, or the smallest
 * rectangle or frame around a loose text shape with it, which is how Leo draws them by hand.
 */
export function findSections(shapes: SectionCandidate[]): Section[] {
	const blocks = shapes.filter((shape) => shape.type === 'geo' || shape.type === 'frame')
	const sections: Section[] = []
	for (const shape of shapes) {
		const number = TITLED.has(shape.type) ? shape.number : null
		if (!number) continue
		const block = shape.type !== 'text' ? shape : blocks
			.filter((candidate) => contains(candidate.bounds, shape.bounds))
			.sort((a, b) => a.bounds.w * a.bounds.h - b.bounds.w * b.bounds.h)[0] ?? shape
		sections.push({ id: block.id, number, bounds: block.bounds })
	}
	return sections
}
