export const REWARD_SKIN_SETS = [
	['arcane-knight', 'moon-magic', 'sunset-riders', 'lunar-witch', 'golden-warrior', 'starlight-duo'],
	['zelda-campfire', 'tracer', 'soraka', 'shadow-warrior', 'luke', 'attack-titan', 'rengoku', 'gyro', 'emilia'],
] as const
export const REWARD_SKINS = [...REWARD_SKIN_SETS[0], ...REWARD_SKIN_SETS[1]] as const
export type RewardSkin = (typeof REWARD_SKINS)[number]
export const isRewardSkin = (value: unknown): value is RewardSkin => REWARD_SKINS.includes(value as RewardSkin)
export const SKINS = [
	'xp',
	'long-dark',
	'slime',
	'halo',
	'valorant',
	'destiny',
	'fortnite',
	'ucn',
	'rivals',
	'deltarune',
	'minecraft',
	'rocket-league',
	'tetris',
	'terraria',
	'smash',
	'doom',
	'roblox',
	'hades',
	'factorio',
	'baldurs-gate',
	'elden-ring',
	'helldivers',
	'kingdom-hearts',
	'dark-souls',
	'cult-of-the-lamb',
	...REWARD_SKINS,
] as const
export type PassSkin = (typeof SKINS)[number]
export const FINISHES = ['matte', 'prism', 'foil', 'stars'] as const
export type PassFinish = (typeof FINISHES)[number]
export const HOLO_PATTERNS = [
	'grid',
	'triangles',
	'rings',
	'flow',
	'stars',
] as const
export type HoloPattern = (typeof HOLO_PATTERNS)[number]
export const HOLO_AREAS = ['all', 'subject', 'background'] as const
export type HoloArea = (typeof HOLO_AREAS)[number]
export interface PassHologram {
	pattern: HoloPattern
	// Kept for older saved passes. The current control changes light color.
	intensity: number
	phase: number
	area?: HoloArea
	// 0..359 selects a color; 360 is the multicolor, full-spectrum stop.
	hue?: number
}
export const defaultHologram = (): PassHologram => ({
	pattern: 'grid',
	intensity: 65,
	phase: 0.18,
	area: 'all',
	hue: 195,
})
export function passHologram(
	draft: Pick<PassDraft, 'finish' | 'hologram'> & { skin?: PassSkin },
): Required<PassHologram> {
	const saved = draft.hologram
	return {
		...defaultHologram(),
		...saved,
		pattern:
			draft.finish === 'stars' && saved?.area === undefined
				? 'stars'
				: (saved?.pattern ?? 'grid'),
		area: REWARD_SKIN_SETS[0].includes(draft.skin as (typeof REWARD_SKIN_SETS)[0][number]) ? 'all' : saved?.area ?? 'all',
		hue: saved?.hue ?? 195,
	}
}
export const STICKERS = [
	'spark',
	'heart',
	'star',
	'moon',
	'planet',
	'flower',
	'ghost',
	'frog',
	'mushroom',
	'controller',
	'pencil',
	'code',
] as const
export type StickerId = (typeof STICKERS)[number]
export type SignaturePoint = [number, number]
export type PassSignature =
	| { kind: 'drawn'; strokes: SignaturePoint[][] }
	| { kind: 'typed'; name: string }
export const MAX_SIGNATURE_POINTS = 512
export const MAX_SIGNATURE_STROKES = 12
export interface PassSticker {
	id: string
	art: StickerId
	x: number
	y: number
	rotation: number
	scale: number
}
export interface PassDraft {
	name: string
	skin: PassSkin
	finish: PassFinish
	brightness: number
	// Optional so previously saved passes keep their design.
	hologram?: PassHologram
	stickers: PassSticker[]
	// Other covers keep their own stickers; legacy stickers belong to `skin`.
	stickersBySkin?: Partial<Record<PassSkin, PassSticker[]>>
	step: number
	opened: boolean
	// Optional for passes saved before the signature step existed.
	signature?: PassSignature | null
}
export interface PassProfile {
	unlockedSkins?: RewardSkin[]
	intro: { name: string; message: string; skin: PassSkin }
	draft: PassDraft
	completed: boolean
	revision: number
}
export function defaultPass(name: string, skin: PassSkin = 'xp'): PassDraft {
	return {
		name: name.slice(0, 32),
		skin,
		finish: 'matte',
		brightness: 0,
		hologram: defaultHologram(),
		stickers: [],
		step: 0,
		opened: false,
		signature: null,
	}
}
export function passStickers(draft: PassDraft, skin: PassSkin): PassSticker[] {
	return skin === draft.skin ? draft.stickers : draft.stickersBySkin?.[skin] ?? []
}
export function updatePassDraft(draft: PassDraft, change: Partial<PassDraft>): PassDraft {
	if (!change.skin || change.skin === draft.skin) return { ...draft, ...change }
	const stickersBySkin = { ...draft.stickersBySkin, [draft.skin]: draft.stickers }
	const stickers = stickersBySkin[change.skin] ?? []
	delete stickersBySkin[change.skin]
	return { ...draft, ...change, stickers: change.stickers ?? stickers, stickersBySkin }
}
const finite = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	value >= min &&
	value <= max
export function validSignature(
	value: unknown,
): value is PassSignature | null | undefined {
	if (value == null) return true
	if (typeof value !== 'object') return false
	const s = value as PassSignature
	if (s.kind === 'typed')
		return (
			typeof s.name === 'string' &&
			s.name.trim().length > 0 &&
			s.name.length <= 32 &&
			!/[\x00-\x1f\x7f]/.test(s.name)
		)
	return (
		s.kind === 'drawn' &&
		Array.isArray(s.strokes) &&
		s.strokes.length > 0 &&
		s.strokes.length <= MAX_SIGNATURE_STROKES &&
		s.strokes.every(
			(stroke) =>
				Array.isArray(stroke) &&
				stroke.length >= 2 &&
				stroke.every(
					(p) =>
						Array.isArray(p) &&
						p.length === 2 &&
						Number.isInteger(p[0]) &&
						Number.isInteger(p[1]) &&
						finite(p[0], 0, 600) &&
						finite(p[1], 0, 340),
				),
		) &&
		s.strokes.reduce((total, stroke) => total + stroke.length, 0) <=
			MAX_SIGNATURE_POINTS
	)
}
export function validPass(value: unknown): value is PassDraft {
	if (!value || typeof value !== 'object') return false
	const d = value as PassDraft
	return (
		typeof d.name === 'string' &&
		d.name.trim().length > 0 &&
		d.name.length <= 32 &&
		!/[\x00-\x1f\x7f]/.test(d.name) &&
		SKINS.includes(d.skin) &&
		FINISHES.includes(d.finish) &&
		finite(d.brightness, -20, 20) &&
		(d.hologram === undefined ||
			(d.hologram !== null &&
				HOLO_PATTERNS.includes(d.hologram.pattern) &&
				finite(d.hologram.intensity, 0, 100) &&
				finite(d.hologram.phase, 0, 1) &&
				(d.hologram.area === undefined ||
					HOLO_AREAS.includes(d.hologram.area)) &&
				(d.hologram.hue === undefined || finite(d.hologram.hue, 0, 360)))) &&
		Number.isInteger(d.step) &&
		d.step >= 0 &&
		d.step <= 4 &&
		typeof d.opened === 'boolean' &&
		validSignature(d.signature) &&
		validStickers(d.stickers) &&
		(d.stickersBySkin === undefined ||
			(d.stickersBySkin !== null && typeof d.stickersBySkin === 'object' && !Array.isArray(d.stickersBySkin) &&
				Object.entries(d.stickersBySkin).every(([skin, stickers]) => SKINS.includes(skin as PassSkin) && validStickers(stickers))))
	)
}
function validStickers(value: unknown): value is PassSticker[] {
	return Array.isArray(value) && value.length <= 8 &&
		new Set(value.map((s) => s?.id)).size === value.length && value.every(
			(s) =>
				s &&
				typeof s.id === 'string' &&
				/^[a-zA-Z0-9_-]{1,48}$/.test(s.id) &&
				STICKERS.includes(s.art) &&
				finite(s.x, 8, 92) &&
				finite(s.y, 8, 92) &&
				finite(s.rotation, -180, 180) &&
				finite(s.scale, 0.6, 1.6),
		)
}
