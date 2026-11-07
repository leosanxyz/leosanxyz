import { describe, expect, it } from 'vitest'
import { chapterFor, readEstado, sectionTitle } from './obs'

describe('section titles', () => {
	it('reads the title after the number and the middle dot', () => {
		expect(sectionTitle('1 · haz el primer paso de tu plan')).toBe('haz el primer paso de tu plan')
		expect(sectionTitle('12·repaso')).toBe('repaso')
		expect(sectionTitle('  3 ·  juega\nsegunda línea')).toBe('juega')
	})
	it('ignores text that only mentions a number, or has no title after the dot', () => {
		for (const text of ['el paso 1 de tu plan', '1. repaso', '1 - repaso', 'paso 2 · algo', '0 · intro', '123 · demasiado', '4 ·', '4 ·  \nabajo', '', undefined]) expect(sectionTitle(text)).toBeNull()
	})
})

describe('chapter by title', () => {
	const titulos = ['Dónde quedó cada quien', 'Worktrees', 'El repo que enseña al agente', 'Lo que repites a mano', 'Tu herramienta: un botón en Unity']
	it('finds the OBS chapter with the same words, whatever its number', () => {
		expect(chapterFor('lo que repites a mano', titulos)).toBe(4)
		expect(chapterFor('tu herramienta · un boton en unity', titulos)).toBe(5)
		expect(chapterFor('  DONDE quedo cada quien ', titulos)).toBe(1)
	})
	it('is 0 when the words differ', () => {
		expect(chapterFor('el repo enseña al agente', titulos)).toBe(0)
		expect(chapterFor('tu herramienta', titulos)).toBe(0)
		expect(chapterFor('repaso', [])).toBe(0)
	})
})

describe('dock state', () => {
	it('keeps only what the canvas shows and drops non-https covers', () => {
		expect(readEstado({ tipo: 'estado', capitulo: 1, titulos: ['A', 7], visible: 'yes', sonando: { titulo: ' Song ', artista: 'Band', portada: 'http://x.test/a.jpg', extra: '<b>' }, otro: 1 }))
			.toEqual({ capitulo: 1, titulos: ['A', ''], visible: false, sonando: { titulo: 'Song', artista: 'Band' } })
		expect(readEstado({ tipo: 'estado', capitulo: 0, sonando: { titulo: 'S', artista: '', portada: 'https://x.test/a.jpg' } })?.sonando).toEqual({ titulo: 'S', artista: '', portada: 'https://x.test/a.jpg' })
		expect(readEstado({ tipo: 'estado', capitulo: 0, sonando: { titulo: '' } })?.sonando).toBeNull()
	})
	it('rejects anything that is not a valid state message', () => {
		for (const data of [null, 'x', { tipo: 'ir_a', capitulo: 1 }, { tipo: 'estado', capitulo: -1 }, { tipo: 'estado', capitulo: 1.5 }, { tipo: 'estado' }]) expect(readEstado(data)).toBeNull()
	})
})
