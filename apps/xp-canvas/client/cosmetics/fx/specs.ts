import type { ShaderFrame, ShaderStrip } from '../../../shared/cosmetics'
import { CH, CW } from '../../portal/pass/materials/materials'
import { FRAME_FS, STRIP_FS } from './shaders'

/** One effect's geometry in design units and its loop. `pad` is how far its light spills past the box. */
export interface FxSpec { fs: string; box: [number, number]; radius: number; pad: [number, number]; loop: number; frames: number; scale: number }

/** A plate is 220 × 36; its sheet is baked at 2 px per unit, so a 220 px plate stays sharp on a retina screen. */
export const PLATE_BOX: [number, number] = [220, 36]
const plate = (shader: ShaderStrip, loop: number, frames: number): FxSpec => ({ fs: STRIP_FS[shader], box: PLATE_BOX, radius: 10, pad: [14, 22], loop, frames, scale: 2 })
export const PLATE_FX: Record<ShaderStrip, FxSpec> = {
	brasa: plate('brasa', 2.667, 32),
	rayo: plate('rayo', 2, 24),
	escarcha: plate('escarcha', 4, 32),
	oro: plate('oro', 4, 32),
}

/** Frames hug the pass card. The mini sheet matches the material minis: a 128 px card. */
export const FRAME_PAD = 34
const frame = (shader: ShaderFrame, loop: number, frames: number): FxSpec => ({ fs: FRAME_FS[shader], box: [CW, CH], radius: 17, pad: [FRAME_PAD, FRAME_PAD], loop, frames, scale: 128 / CW })
export const FRAME_FX: Record<ShaderFrame, FxSpec> = {
	llamas: frame('llamas', 2.667, 32),
	escarcha: frame('escarcha', 4, 32),
	circuito: frame('circuito', 3, 36),
	oro: frame('oro', 4, 32),
}

/** Canvas pixels of one frame at a given scale. */
export const fxSize = (spec: FxSpec, scale = spec.scale) => [Math.round((spec.box[0] + 2 * spec.pad[0]) * scale), Math.round((spec.box[1] + 2 * spec.pad[1]) * scale)] as const
