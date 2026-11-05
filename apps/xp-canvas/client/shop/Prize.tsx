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
const points = (value: number) => value.toLocaleString('es-MX')

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
 * A cosmetic on the front of a shop card: the object alone on a dark surface, with its name, rarity and, in the rows for sale, its price.
 * Materials and frames are dressed on the student's cover as baked minis, with no live WebGL; `live` draws a plate's shader for the one detail open.
 */
export function PrizeFace({ prize, cover, name, price, caption = true, live = false }: {
	prize: ShopPrize; cover: PassSkin; name: string; price?: number; caption?: boolean; live?: boolean
}) {
	const item = prizeItem(prize)
	if (!item) return null
	return <span className="prize-face" data-kind={item.kind} data-rarity={item.rarity} style={{ '--rarity': RARITY[item.rarity].color } as CSSProperties}>
		<span className="prize-face__object">
			{item.kind === 'plate' ? <Plate plate={item.id} name={name} live={live} />
				: <span className="prize-face__card">
					<MaterialMini skin={cover} material={item.kind === 'material' ? item.material : 'none'} />
					{item.kind === 'frame' && <CardFrame frame={item.id} />}
				</span>}
		</span>
		{caption && <span className="prize-face__caption">
			<span className="prize-face__name">{item.name}</span>
			<span className="prize-face__meta">
				<RarityChip prize={prize} />
				{price !== undefined && <span className="prize-face__price"><span className="shop-coin" aria-hidden="true" />{points(price)}</span>}
			</span>
		</span>}
	</span>
}
