import { T } from '@tldraw/validate'
import type { TLShape } from '@tldraw/tlschema'

export const ESQUIVA_ULTIMO_PASO = 5

/** Demo de Esquiva: la versión elegida y el "ver el inicio" se sincronizan con todos los que ven el canvas. */
export const esquivaShapeProps = {
	w: T.positiveNumber, h: T.positiveNumber,
	paso: T.integer.refine((value) => {
		if (value < 0 || value > ESQUIVA_ULTIMO_PASO) throw new Error('Versión inválida.')
		return value
	}),
	antes: T.boolean,
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		esquiva: { w: number; h: number; paso: number; antes: boolean }
	}
}
export type EsquivaShape = TLShape<'esquiva'>
