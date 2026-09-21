import { useEffect, useRef, type CSSProperties } from 'react'
import type { GachaponResult } from '../../shared/gachaponShape'
import { skins } from '../portal/pass/catalog'

export function GachaponReveal({ result }: { result: GachaponResult }) {
	const root = useRef<HTMLDivElement>(null)
	const skin = skins.find((s) => s.id === result.skin)!
	useEffect(() => {
		const slot = document.querySelector(`[data-gachapon-id="${CSS.escape(result.shapeId)}"] .gachapon__slot`)?.getBoundingClientRect()
		if (slot && slot.right > 0 && slot.left < innerWidth && slot.bottom > 0 && slot.top < innerHeight) {
			root.current?.style.setProperty('--capsule-x', `${slot.left + slot.width / 2 - innerWidth / 2}px`)
			root.current?.style.setProperty('--capsule-y', `${slot.top + slot.height / 2 - innerHeight / 2}px`)
		}
		// Seek from the server timestamp so peers arriving a little later see the same stage.
		for (const animation of root.current?.getAnimations({ subtree: true }) ?? []) animation.currentTime = Math.max(0, Date.now() - result.startedAt)
	}, [result.id, result.startedAt])
	return <div ref={root} className="gachapon-reveal" data-gachapon-result={result.id} style={{ '--prize-color': skin.color } as CSSProperties}>
		<div className="gachapon-reveal__capsule" aria-hidden="true"><i /><i /></div>
		<div className="gachapon-reveal__prize" role="status"><p>{result.name} ganó</p><div className="gachapon-reveal__card"><img style={{ objectPosition: skin.position }} src={skin.image} alt={skin.name} /><span>{skin.name}</span></div><small>Tarjeta desbloqueada</small></div>
	</div>
}
