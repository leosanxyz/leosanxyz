import type { CardMaterial } from './pass'

/** Rarity is visual cost: the heavier an effect is on screen, the rarer and dearer it is. */
export const RARITIES = ['comun', 'rara', 'epica', 'legendaria'] as const
export type Rarity = (typeof RARITIES)[number]
export const RARITY: Record<Rarity, { name: string; color: string; price: number }> = {
	comun: { name: 'Común', color: '#8a877f', price: 100 },
	rara: { name: 'Rara', color: '#2d6ae3', price: 250 },
	epica: { name: 'Épica', color: '#7c5cff', price: 500 },
	legendaria: { name: 'Legendaria', color: '#e8b84a', price: 900 },
}

/**
 * Materials are sold in the shop and won in the machine, and the pass only saves one the student owns.
 * Turning this off would give every material to everyone again, as while Leo tried them out.
 */
export const MATERIALS_FOR_SALE = true

export type CosmeticKind = 'material' | 'plate' | 'frame' | 'effect'
export type ShaderStrip = 'brasa' | 'rayo' | 'escarcha' | 'oro'
export type ShaderFrame = 'llamas' | 'escarcha' | 'circuito' | 'oro'

/**
 * How each item looks. Commons are static CSS; rares animate with CSS and SVG only (transform and opacity, so a list of 14 stays on the compositor);
 * epics and legendaries are shaders baked once into sprite sheets for lists, and drawn live only in the one hero on screen.
 * `ink` is the name's color over the plate.
 */
export type PlateLook =
	| { look: 'flat'; fill: string; ink: string; edge: string }
	| { look: 'animated'; style: 'aurora' | 'neon' | 'pixel' | 'tinta'; ink: string }
	| { look: 'shader'; shader: ShaderStrip; ink: string }
export type FrameLook =
	| { look: 'line'; color: string }
	| { look: 'animated'; style: 'cinta' | 'estrellas' | 'neon'; color: string }
	| { look: 'shader'; shader: ShaderFrame; color: string }

type Entry<K extends CosmeticKind, Extra> = { id: `${K}:${string}`; kind: K; rarity: Rarity; name: string; free?: true } & Extra
export type MaterialItem = Entry<'material', { material: Exclude<CardMaterial, 'none'> }>
export type PlateItem = Entry<'plate', { spec: PlateLook }>
export type FrameItem = Entry<'frame', { spec: FrameLook }>
/** Profile effects are listed but not built yet: the shop shows them as coming soon and nobody can buy them. */
export type EffectItem = Entry<'effect', { soon: true }>
export type CosmeticItem = MaterialItem | PlateItem | FrameItem | EffectItem

const MATERIAL_ITEMS: MaterialItem[] = ([
	['fuego', 'Fuego', 'epica'], ['slime', 'Slime', 'epica'], ['metal-color', 'Metal con color', 'epica'], ['fantasma-color', 'Fantasma con color', 'epica'],
	['rayo', 'Rayo', 'epica'], ['hielo', 'Hielo', 'epica'], ['metal', 'Metal', 'legendaria'], ['fantasma', 'Fantasma', 'legendaria'],
] as const).map(([material, name, rarity]) => ({ id: `material:${material}`, kind: 'material', rarity, name, material }))

const PLATE_ITEMS: PlateItem[] = [
	{ id: 'plate:grafito', kind: 'plate', rarity: 'comun', name: 'Grafito', free: true, spec: { look: 'flat', fill: '#2a2a2c', ink: '#f6f4ef', edge: '#ffffff1f' } },
	{ id: 'plate:crema', kind: 'plate', rarity: 'comun', name: 'Crema', spec: { look: 'flat', fill: '#f1e7d2', ink: '#2a2721', edge: '#00000014' } },
	{ id: 'plate:ultramar', kind: 'plate', rarity: 'comun', name: 'Ultramar', spec: { look: 'flat', fill: '#1f3fd1', ink: '#ffffff', edge: '#ffffff26' } },
	{ id: 'plate:naranja', kind: 'plate', rarity: 'comun', name: 'Naranja', spec: { look: 'flat', fill: '#ff6a1f', ink: '#1d1208', edge: '#ffffff33' } },
	{ id: 'plate:aurora', kind: 'plate', rarity: 'rara', name: 'Aurora', spec: { look: 'animated', style: 'aurora', ink: '#ffffff' } },
	{ id: 'plate:neon', kind: 'plate', rarity: 'rara', name: 'Neón', spec: { look: 'animated', style: 'neon', ink: '#fff4fb' } },
	{ id: 'plate:pixel', kind: 'plate', rarity: 'rara', name: 'Píxel', spec: { look: 'animated', style: 'pixel', ink: '#d8ffe2' } },
	{ id: 'plate:tinta', kind: 'plate', rarity: 'rara', name: 'Tinta', spec: { look: 'animated', style: 'tinta', ink: '#1a1712' } },
	{ id: 'plate:brasa', kind: 'plate', rarity: 'epica', name: 'Brasa', spec: { look: 'shader', shader: 'brasa', ink: '#fff3e2' } },
	{ id: 'plate:rayo', kind: 'plate', rarity: 'epica', name: 'Rayo', spec: { look: 'shader', shader: 'rayo', ink: '#f2fbff' } },
	{ id: 'plate:escarcha', kind: 'plate', rarity: 'epica', name: 'Escarcha', spec: { look: 'shader', shader: 'escarcha', ink: '#0f2236' } },
	{ id: 'plate:oro-vivo', kind: 'plate', rarity: 'legendaria', name: 'Oro vivo', spec: { look: 'shader', shader: 'oro', ink: '#2b1a02' } },
]

const FRAME_ITEMS: FrameItem[] = [
	{ id: 'frame:fino-gris', kind: 'frame', rarity: 'comun', name: 'Fino gris', free: true, spec: { look: 'line', color: '#a9a69e' } },
	{ id: 'frame:fino-negro', kind: 'frame', rarity: 'comun', name: 'Fino negro', spec: { look: 'line', color: '#1a1a1a' } },
	{ id: 'frame:fino-naranja', kind: 'frame', rarity: 'comun', name: 'Fino naranja', spec: { look: 'line', color: '#ff6a1f' } },
	{ id: 'frame:fino-ultramar', kind: 'frame', rarity: 'comun', name: 'Fino ultramar', spec: { look: 'line', color: '#1f3fd1' } },
	{ id: 'frame:cinta', kind: 'frame', rarity: 'rara', name: 'Cinta', spec: { look: 'animated', style: 'cinta', color: '#ffd76a' } },
	{ id: 'frame:estrellas', kind: 'frame', rarity: 'rara', name: 'Estrellas', spec: { look: 'animated', style: 'estrellas', color: '#fff3c4' } },
	{ id: 'frame:neon', kind: 'frame', rarity: 'rara', name: 'Neón', spec: { look: 'animated', style: 'neon', color: '#ff4fb8' } },
	{ id: 'frame:llamas', kind: 'frame', rarity: 'epica', name: 'Llamas', spec: { look: 'shader', shader: 'llamas', color: '#ff7a1a' } },
	{ id: 'frame:escarcha', kind: 'frame', rarity: 'epica', name: 'Escarcha', spec: { look: 'shader', shader: 'escarcha', color: '#bfe3ff' } },
	{ id: 'frame:circuito', kind: 'frame', rarity: 'epica', name: 'Circuito', spec: { look: 'shader', shader: 'circuito', color: '#6fd8ff' } },
	{ id: 'frame:oro-vivo', kind: 'frame', rarity: 'legendaria', name: 'Oro vivo', spec: { look: 'shader', shader: 'oro', color: '#edc76e' } },
]

const EFFECT_ITEMS: EffectItem[] = [
	{ id: 'effect:orbita', kind: 'effect', rarity: 'rara', name: 'Órbita', soon: true },
	{ id: 'effect:chispa', kind: 'effect', rarity: 'epica', name: 'Chispa', soon: true },
	{ id: 'effect:eclipse', kind: 'effect', rarity: 'legendaria', name: 'Eclipse', soon: true },
]

export const COSMETICS: readonly CosmeticItem[] = [...MATERIAL_ITEMS, ...PLATE_ITEMS, ...FRAME_ITEMS, ...EFFECT_ITEMS]
export type CosmeticId = CosmeticItem['id']
export type PlateId = PlateItem['id']
export type FrameId = FrameItem['id']
export type EffectId = EffectItem['id']

const BY_ID = new Map<string, CosmeticItem>(COSMETICS.map((item) => [item.id, item]))
export const cosmetic = (id: unknown): CosmeticItem | undefined => typeof id === 'string' ? BY_ID.get(id) : undefined
export const isCosmeticOf = <K extends CosmeticKind>(id: unknown, kind: K): id is Extract<CosmeticItem, { kind: K }>['id'] => cosmetic(id)?.kind === kind
export const plateItem = (id: unknown) => isCosmeticOf(id, 'plate') ? BY_ID.get(id) as PlateItem : undefined
export const frameItem = (id: unknown) => isCosmeticOf(id, 'frame') ? BY_ID.get(id) as FrameItem : undefined
export const materialItem = (material: CardMaterial) => material === 'none' ? undefined : BY_ID.get(`material:${material}`) as MaterialItem

export const cosmeticPrice = (item: CosmeticItem) => item.free ? 0 : RARITY[item.rarity].price
/** Whether a student can buy it at all: not free, not coming soon, and materials only once they are for sale. */
export const forSale = (item: CosmeticItem) => !item.free && item.kind !== 'effect' && (item.kind !== 'material' || MATERIALS_FOR_SALE)
/** Free items, and materials while they are not for sale, belong to everyone; the rest only once bought. */
export const ownsCosmetic = (item: CosmeticItem, bought: ReadonlySet<string>) =>
	!!item.free || (item.kind === 'material' && !MATERIALS_FOR_SALE) || (item.kind !== 'effect' && bought.has(item.id))

export interface CosmeticPurchase { item: CosmeticId; points: number; owned: CosmeticId[] }

