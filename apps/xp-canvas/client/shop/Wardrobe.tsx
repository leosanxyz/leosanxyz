import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
	COSMETICS, cosmetic, cosmeticPrice, forSale, MATERIALS_FOR_SALE, materialItem, ownsCosmetic, RARITIES, RARITY,
	type CosmeticEquip, type CosmeticId, type CosmeticItem, type CosmeticPurchase, type EquipSlot,
} from '../../shared/cosmetics'
import { applyEquip, defaultPass, type PassDraft, type PassProfile } from '../../shared/pass'
import type { ShopState } from '../../shared/shop'
import { CardFrame } from '../cosmetics/CardFrame'
import { Plate } from '../cosmetics/Plate'
import { playCoin } from '../gachapon/gachaponSounds'
import { navigate } from '../navigation'
import { portalRequest } from '../portal/api'
import { skins } from '../portal/pass/catalog'
import { MaterialMini } from '../portal/pass/materials/MaterialMini'
import { PassCard } from '../portal/pass/PassCard'

const points = (value: number) => value.toLocaleString('es-MX')
/** Inside each tier: plates, frames, materials, then what is coming. */
const ORDER = { plate: 0, frame: 1, material: 2, effect: 3 } as const
const TIERS = RARITIES.map((rarity) => ({ rarity, items: COSMETICS.filter((item) => item.rarity === rarity).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]) }))

type Mode = 'buy' | 'confirm' | 'busy' | 'short' | 'wear' | 'worn' | 'soon' | 'preview'

/**
 * The pass's five slots and the catalog by rarity. Choosing an item tries it on the pass at the left;
 * its own button buys it, asking twice like a card, or puts it on once it is yours.
 */
export function Wardrobe({ state, name, onState }: { state: ShopState; name: string; onState: (change: (current: ShopState) => ShopState) => void }) {
	const [profile, setProfile] = useState<PassDraft | null>(null)
	const [selected, setSelected] = useState<CosmeticId | null>(null), [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
	const { owned, equipped } = state.cosmetics
	const bought = useMemo(() => new Set<string>(owned), [owned])
	useEffect(() => {
		if (state.teacher) { setProfile(defaultPass(name.split(' ')[0])); return }
		let live = true
		portalRequest<PassProfile>('pass').then((pass) => { if (live) setProfile(pass.draft) }).catch(() => { if (live) setError('No pude cargar tu pase.') })
		return () => { live = false }
	}, [state.teacher, name])
	useEffect(() => {
		if (!confirming) return
		const timer = setTimeout(() => setConfirming(false), 4000)
		return () => clearTimeout(timer)
	}, [confirming])
	// What is worn, kept in step with the server's answer after each equip.
	const worn = useMemo(() => profile && applyEquip({ ...profile, plate: equipped.plate, frame: equipped.frame }, 'material', materialItem(equipped.material) ?? null), [profile, equipped])
	const item = cosmetic(selected)
	const trial = useMemo(() => worn && item && item.kind !== 'effect' ? applyEquip(worn, item.kind, item) : worn, [worn, item])

	function choose(id: CosmeticId) {
		setError(''); setConfirming(false)
		setSelected((current) => current === id ? null : id)
	}
	const isWorn = (target: CosmeticItem) => target.kind === 'plate' ? equipped.plate === target.id : target.kind === 'frame' ? equipped.frame === target.id
		: target.kind === 'material' && equipped.material === target.material
	function modeOf(target: CosmeticItem): Mode {
		if (target.kind === 'effect') return 'soon'
		if (state.teacher) return 'preview'
		if (ownsCosmetic(target, bought)) return isWorn(target) ? 'worn' : 'wear'
		if (busy) return 'busy'
		if (cosmeticPrice(target) > state.points) return 'short'
		return confirming ? 'confirm' : 'buy'
	}
	async function act(target: CosmeticItem) {
		const mode = modeOf(target)
		if (mode === 'buy') { setConfirming(true); return }
		if (mode === 'confirm') {
			setBusy(true); setError('')
			try {
				const result = await portalRequest<CosmeticPurchase>('shop/cosmetic/buy', 'POST', { item: target.id })
				playCoin()
				onState((current) => ({ ...current, points: result.points, cosmetics: { ...current.cosmetics, owned: result.owned } }))
			} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude comprarlo.') }
			finally { setBusy(false); setConfirming(false) }
			return
		}
		if (mode === 'wear' && target.kind !== 'effect') await equip(target.kind, target.id)
	}
	async function equip(slot: EquipSlot, id: CosmeticId | null) {
		setBusy(true); setError('')
		try {
			const result = await portalRequest<CosmeticEquip>('shop/cosmetic/equip', 'POST', { slot, item: id })
			onState((current) => ({ ...current, cosmetics: { ...current.cosmetics, equipped: result.equipped } }))
			if (id === null && cosmetic(selected)?.kind === slot) setSelected(null)
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude guardarlo en tu pase.') }
		finally { setBusy(false) }
	}

	const material = materialItem(equipped.material)
	const slots: { slot: string; label: string; worn: string | null; take?: EquipSlot; art: ReactNode }[] = worn ? [
		{ slot: 'card', label: 'Carta', worn: skins.find((s) => s.id === worn.skin)?.name ?? null, art: <MaterialMini className="shop-slot__card" skin={worn.skin} material="none" /> },
		{ slot: 'material', label: 'Material', worn: material ? material.name : null, take: material ? 'material' : undefined, art: <MaterialMini className="shop-slot__card" skin={worn.skin} material={equipped.material} /> },
		{ slot: 'frame', label: 'Marco', worn: cosmetic(equipped.frame)?.name ?? null, take: equipped.frame ? 'frame' : undefined, art: <span className="shop-slot__framed"><MaterialMini className="shop-slot__card" skin={worn.skin} material="none" /><CardFrame frame={equipped.frame} /></span> },
		{ slot: 'plate', label: 'Placa', worn: cosmetic(equipped.plate)?.name ?? null, take: equipped.plate ? 'plate' : undefined, art: <Plate className="shop-slot__plate" plate={equipped.plate ?? 'plate:grafito'} name={name.split(' ')[0]} /> },
		{ slot: 'effect', label: 'Efecto', worn: null, art: <span className="shop-slot__soon" /> },
	] : []

	return <section className="shop-wear" aria-labelledby="shop-wear-title" data-testid="shop-wardrobe">
		<div className="shop-cards__heading"><h2 id="shop-wear-title">Tu pase</h2></div>
		<div className="shop-wear__top">
			<div className="shop-wear__stage">
				{trial && <>
					<div className="shop-wear__card"><PassCard draft={trial} /></div>
					<div className="shop-wear__row"><Plate plate={trial.plate} name={name} live /></div>
				</>}
			</div>
			<ol className="shop-slots" aria-label="Lo que llevas">
				{slots.map((slot) => <li key={slot.slot} className="shop-slot" data-slot={slot.slot} data-empty={!slot.worn || undefined}>
					<span className="shop-slot__art" aria-hidden="true">{slot.art}</span>
					<span className="shop-slot__text"><span className="shop-slot__label">{slot.label}</span><strong>{slot.slot === 'effect' ? 'Llega pronto' : slot.worn ?? 'Nada'}</strong></span>
					{slot.slot === 'card' && !state.teacher && <button type="button" className="shop-slot__action" onClick={() => navigate('/mi-pase')}>Cambiar</button>}
					{slot.take && !state.teacher && <button type="button" className="shop-slot__action" disabled={busy} onClick={() => void equip(slot.take!, null)}>Quitar</button>}
				</li>)}
			</ol>
		</div>
		{error && <p className="xp-error shop-wear__error" role="alert">{error}</p>}
		<div className="shop-tiers">
			{TIERS.map(({ rarity, items }) => <section key={rarity} className="shop-tier" data-rarity={rarity} style={{ '--rarity': RARITY[rarity].color } as CSSProperties} aria-label={RARITY[rarity].name}>
				<header className="shop-tier__name"><strong>{RARITY[rarity].name}</strong><span><span className="shop-coin" aria-hidden="true" />{points(RARITY[rarity].price)}</span></header>
				<ul className="shop-tier__items">
					{items.map((target) => {
						const mode = modeOf(target), open = selected === target.id
						return <li key={target.id} className="shop-item" data-kind={target.kind} data-mode={mode} data-open={open || undefined}>
							<button type="button" className="shop-item__pick" aria-pressed={open} data-testid={`cosmetic-${target.id}`} onClick={() => choose(target.id)}>
								<span className="shop-item__art" aria-hidden="true">{trial && <ItemArt item={target} skin={trial.skin} name={name.split(' ')[0]} />}</span>
								<span className="shop-item__name">{target.name}</span>
								<span className="shop-item__state">{stateLine(target, mode)}</span>
							</button>
							{open && mode !== 'soon' && mode !== 'worn' && mode !== 'preview' && <button type="button" className="shop-item__act" data-mode={mode} disabled={mode === 'busy' || mode === 'short' || busy} onClick={() => void act(target)}>
								{actionLabel(target, mode, state.points)}
							</button>}
						</li>
					})}
				</ul>
			</section>)}
		</div>
	</section>
}

function stateLine(item: CosmeticItem, mode: Mode) {
	if (mode === 'soon') return 'Pronto'
	if (mode === 'worn') return 'Puesto'
	if (mode === 'wear') return item.free || (item.kind === 'material' && !MATERIALS_FOR_SALE) ? 'Gratis' : 'Tuyo'
	if (!forSale(item)) return 'Gratis'
	return <><span className="shop-coin" aria-hidden="true" />{points(cosmeticPrice(item))}</>
}
function actionLabel(item: CosmeticItem, mode: Mode, have: number) {
	const price = points(cosmeticPrice(item))
	if (mode === 'confirm') return `Confirmar · ${price}`
	if (mode === 'busy') return 'Un momento…'
	if (mode === 'short') return `Te faltan ${points(cosmeticPrice(item) - have)}`
	if (mode === 'wear') return 'Ponerme'
	return `Comprar · ${price}`
}

/** Each item drawn as it would look on this student: plates with their name, frames and materials on their card. */
function ItemArt({ item, skin, name }: { item: CosmeticItem; skin: PassDraft['skin']; name: string }) {
	if (item.kind === 'plate') return <Plate plate={item.id} name={name} />
	if (item.kind === 'frame') return <span className="shop-item__framed"><MaterialMini className="shop-item__card" skin={skin} material="none" /><CardFrame frame={item.id} /></span>
	if (item.kind === 'material') return <MaterialMini className="shop-item__card" skin={skin} material={item.material} />
	return <span className="shop-item__soon" />
}
