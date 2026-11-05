import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { GachaponResult } from '../../shared/gachaponShape'
import { isRewardSkin, type PassSkin } from '../../shared/pass'
import type { ShopPrize } from '../../shared/shop'
import { skins } from '../portal/pass/catalog'
import { prizeColor, PrizeCover, prizeItem, prizeKind, RarityChip } from '../shop/Prize'
import { scheduleSpinSounds } from './gachaponSounds'

const BIT_COLORS = ['#ffd45c', '#ffffff', '#ff8fb8', '#6fb7ff', '#8fd66b']

/** Confetti directions derived from the result id, so every viewer sees the same burst. */
function confetti(id: string, prizeColor: string) {
	let state = [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
	const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32
	return Array.from({ length: 36 }, (_, i) => {
		const angle = (i / 36) * Math.PI * 2 + random() * 0.3, distance = 170 + random() * 260
		return {
			'--dx': `${Math.cos(angle) * distance}px`, '--dy': `${Math.sin(angle) * distance}px`,
			'--spin': `${(random() - 0.5) * 900}deg`, '--size': `${8 + random() * 10}px`,
			'--bit-color': i % 4 === 0 ? prizeColor : BIT_COLORS[i % BIT_COLORS.length],
			'--round': i % 3 === 0 ? '50%' : '3px',
		} as CSSProperties
	})
}

/** The canvas machine reveals a card; the shop's can also reveal a cosmetic, shown on the student's cover with its rarity. */
export function GachaponReveal({ result, cover = 'xp' }: { result: Omit<GachaponResult, 'skin'> & { skin: ShopPrize }; cover?: PassSkin }) {
	const root = useRef<HTMLDivElement>(null)
	const skin = isRewardSkin(result.skin) ? skins.find((s) => s.id === result.skin)! : null, item = prizeItem(result.skin)
	const color = prizeColor(result.skin)
	const bits = useMemo(() => confetti(result.id, color), [result.id, color])
	useEffect(() => {
		const slot = document.querySelector(`[data-gachapon-id="${CSS.escape(result.shapeId)}"] .gachapon__slot`)?.getBoundingClientRect()
		if (slot && slot.right > 0 && slot.left < innerWidth && slot.bottom > 0 && slot.top < innerHeight) {
			root.current?.style.setProperty('--capsule-x', `${slot.left + slot.width / 2 - innerWidth / 2}px`)
			root.current?.style.setProperty('--capsule-y', `${slot.top + slot.height / 2 - innerHeight / 2}px`)
		}
		// Seek from the server timestamp so peers arriving a little later see the same stage.
		for (const animation of root.current?.getAnimations({ subtree: true }) ?? []) animation.currentTime = Math.max(0, Date.now() - result.startedAt)
		scheduleSpinSounds(result.id, result.startedAt)
	}, [result.id, result.startedAt])
	return <div ref={root} className="gachapon-reveal" data-gachapon-result={result.id} style={{ '--prize-color': color } as CSSProperties}>
		<div className="gachapon-reveal__backdrop" aria-hidden="true" />
		<div className="gachapon-reveal__rays" aria-hidden="true" />
		<div className="gachapon-reveal__capsule" aria-hidden="true"><b className="gachapon-reveal__glow" /><i /><i /></div>
		<div className="gachapon-reveal__flash" aria-hidden="true" />
		<div className="gachapon-reveal__confetti" aria-hidden="true">{bits.map((style, i) => <i key={i} style={style} />)}</div>
		<div className="gachapon-reveal__prize" role="status">
			<p>{result.name} ganó</p>
			<div className="gachapon-reveal__float">
				<div className="gachapon-reveal__card">
					{skin ? <div className="gachapon-reveal__face"><img style={{ objectPosition: skin.position }} src={skin.image} alt={skin.name} /><span>{skin.name}</span></div>
						: <div className="gachapon-reveal__face" data-cosmetic><PrizeCover prize={result.skin} cover={cover} name={result.name} /></div>}
					<div className="gachapon-reveal__back" aria-hidden="true" />
				</div>
			</div>
			{item ? <small data-cosmetic>{prizeKind(result.skin)} <RarityChip prize={result.skin} /></small> : <small>Tarjeta desbloqueada</small>}
		</div>
	</div>
}
