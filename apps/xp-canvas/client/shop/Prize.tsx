import type { CSSProperties } from 'react'
import { cosmetic, cosmeticPrice, RARITY, type CosmeticItem } from '../../shared/cosmetics'
import { defaultHologram, defaultPass, isRewardSkin, type PassDraft, type PassSkin, type RewardSkin } from '../../shared/pass'
import type { ShopPrize, ShopState } from '../../shared/shop'
import { CardFrame } from '../cosmetics/CardFrame'
import { Plate } from '../cosmetics/Plate'
import { skins } from '../portal/pass/catalog'
import { MaterialMini } from '../portal/pass/materials/MaterialMini'
import './prize.css'

const KIND = { material: 'Efecto de carta', frame: 'Marco', plate: 'Placa', effect: 'Efecto de perfil' } as const
const art = (skin: RewardSkin) => skins.find((item) => item.id === skin)!

export const prizeItem = (prize: ShopPrize): CosmeticItem | undefined => isRewardSkin(prize) ? undefined : cosmetic(prize)
export const prizeName = (prize: ShopPrize) => isRewardSkin(prize) ? art(prize).name : cosmetic(prize)!.name
/** A card's own color; a cosmetic's is its rarity's, for the flash, the capsule and the glow. */
export const prizeColor = (prize: ShopPrize) => isRewardSkin(prize) ? art(prize).color : RARITY[cosmetic(prize)!.rarity].color
export const prizeKind = (prize: ShopPrize) => isRewardSkin(prize) ? 'Tarjeta' : KIND[cosmetic(prize)!.kind]
export const prizePrice = (prize: ShopPrize, state: ShopState) => isRewardSkin(prize) ? state.cardCost : cosmeticPrice(cosmetic(prize)!)
export const hasPrize = (prize: ShopPrize, state: ShopState) => isRewardSkin(prize) ? state.owned.includes(prize) : state.cosmetics.includes(prize)

/** The profile's grid foil in full spectrum: on these illustrations it reads better than one hue per card. */
export function shopDraft(skin: RewardSkin): PassDraft {
	return { ...defaultPass(art(skin).name, skin), finish: 'prism', hologram: { ...defaultHologram(), hue: 360 } }
}

/** The pass a prize is seen on at full size: a card as itself, a material or a frame worn on the student's cover. */
export function prizeDraft(prize: ShopPrize, cover: PassSkin): PassDraft {
	if (isRewardSkin(prize)) return shopDraft(prize)
	const item = cosmetic(prize)!, base = defaultPass('', cover)
	if (item.kind === 'material') return { ...base, hologram: { ...defaultHologram(), material: item.material } }
	return item.kind === 'frame' ? { ...base, frame: item.id } : base
}

export function RarityChip({ prize }: { prize: ShopPrize }) {
	const item = prizeItem(prize)
	if (!item) return null
	return <span className="prize-rarity" data-rarity={item.rarity} style={{ '--rarity': RARITY[item.rarity].color } as CSSProperties}>{RARITY[item.rarity].name}</span>
}

/**
 * A cosmetic as a card of its own in the rows, the way a card for sale shows its art: the student's cover at full bleed wearing the
 * material or the frame, or the plate alone on the black of the card back. Only its name is printed; rarity and price wait in the detail.
 * `width` is the card's CSS width, for a material baked sharp at that size (without it, the mini's sheet); `live` draws a plate's shader for the one detail open.
 */
export function PrizeCover({ prize, cover, name, width, caption = true, live = false }: {
	prize: ShopPrize; cover: PassSkin; name: string; width?: number; caption?: boolean; live?: boolean
}) {
	const item = prizeItem(prize)
	if (!item) return null
	return <span className="prize-cover" data-kind={item.kind} data-rarity={item.rarity}>
		{item.kind === 'plate' ? <span className="prize-cover__plate"><Plate plate={item.id} name={name} live={live} /></span>
			: <MaterialMini className="prize-cover__art" skin={cover} material={item.kind === 'material' ? item.material : 'none'} width={width} />}
		{item.kind === 'frame' && <CardFrame frame={item.id} />}
		{caption && <PrizeCaption prize={prize} />}
	</span>
}

/** The name printed at the foot of a row's cosmetic. The detail lays one over its card that fades as it opens, so the name never jumps. */
export function PrizeCaption({ prize, leaving = false }: { prize: ShopPrize; leaving?: boolean }) {
	return <span className="prize-caption" data-leaving={leaving || undefined} aria-hidden="true"><span>{prizeName(prize)}</span></span>
}
