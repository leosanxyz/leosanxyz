import { COSMETICS, ownsCosmetic, type CosmeticId, type FrameItem, type PlateItem } from '../../../shared/cosmetics'
import type { PassDraft } from '../../../shared/pass'
import { CardFrame } from '../../cosmetics/CardFrame'
import { Plate } from '../../cosmetics/Plate'
import { MaterialMini } from './materials/MaterialMini'

/**
 * The frame and the plate the pass wears, from what the student has: the free basics and what they bought or won in the shop.
 * Same picker as the special materials, one row each, «Ninguno» first.
 */
export function WearControls({ draft, owned = [], onChange }: { draft: PassDraft; owned?: readonly CosmeticId[]; onChange: (change: Partial<PassDraft>) => void }) {
	const bought = new Set<string>(owned)
	const mine = COSMETICS.filter((item) => ownsCosmetic(item, bought))
	const frames = mine.filter((item): item is FrameItem => item.kind === 'frame'), plates = mine.filter((item): item is PlateItem => item.kind === 'plate')
	const name = draft.name.split(' ')[0] || 'Tu nombre'
	return <div className="pass-wear">
		<div className="pass-wear__row" role="group" aria-labelledby="pass-wear-frame">
			<span className="pass-wear__label" id="pass-wear-frame">Marco</span>
			<div className="pass-material-picker" data-wear="frame">
				<button aria-label="Ninguno" title="Ninguno" aria-pressed={!draft.frame} onClick={() => onChange({ frame: null })}><span className="pass-wear__none" /></button>
				{frames.map((item) => <button key={item.id} data-item={item.id} aria-label={item.name} title={item.name} aria-pressed={draft.frame === item.id} onClick={() => onChange({ frame: item.id })}>
					<span className="pass-wear__framed"><MaterialMini skin={draft.skin} material="none" /><CardFrame frame={item.id} /></span>
				</button>)}
			</div>
		</div>
		<div className="pass-wear__row" role="group" aria-labelledby="pass-wear-plate">
			<span className="pass-wear__label" id="pass-wear-plate">Placa</span>
			<div className="pass-material-picker" data-wear="plate">
				<button aria-label="Ninguno" title="Ninguno" aria-pressed={!draft.plate} onClick={() => onChange({ plate: null })}><span className="pass-wear__none">Ninguno</span></button>
				{plates.map((item) => <button key={item.id} data-item={item.id} aria-label={item.name} title={item.name} aria-pressed={draft.plate === item.id} onClick={() => onChange({ plate: item.id })}>
					<Plate plate={item.id} name={name} />
				</button>)}
			</div>
		</div>
	</div>
}
