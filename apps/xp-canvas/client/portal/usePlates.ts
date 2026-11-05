import { useEffect, useState } from 'react'
import type { PlateId } from '../../shared/cosmetics'
import { portalRequest } from './api'

/**
 * The plates of the students in a list that comes from presence, not from the roster. It asks again only when someone new appears,
 * and once a minute while the list is open, so a plate put on in the shop shows up during class.
 */
export function usePlates(ids: string[]) {
	const [plates, setPlates] = useState<Record<string, PlateId>>({})
	const key = [...new Set(ids)].sort().join(',')
	useEffect(() => {
		if (!key) return
		let live = true
		const load = () => portalRequest<{ plates: Record<string, PlateId> }>(`plates?ids=${key}`).then((result) => { if (live) setPlates(result.plates) }).catch(() => { /* names still show without plates */ })
		void load()
		const timer = setInterval(load, 60_000)
		return () => { live = false; clearInterval(timer) }
	}, [key])
	return plates
}
