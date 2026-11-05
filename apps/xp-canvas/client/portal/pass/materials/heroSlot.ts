import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

// One live WebGL context per kind of hero per page: the first in mount order that is on screen owns it.
// Materials, frames and plates each have their own slot, so a pass with a material and a frame draws both live.
type Hero = { visible: boolean }
const groups = new Map<string, { heroes: Hero[]; owner: Hero | null }>()
const listeners = new Set<() => void>()

const group = (key: string) => {
	let entry = groups.get(key)
	if (!entry) groups.set(key, entry = { heroes: [], owner: null })
	return entry
}
function update(key: string) {
	const entry = group(key), next = entry.heroes.find((hero) => hero.visible) ?? null
	if (next === entry.owner) return
	entry.owner = next
	for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function useHeroSlot(ref: RefObject<HTMLElement | null>, enabled: boolean, key = 'material') {
	const [hero] = useState<Hero>(() => ({ visible: false }))
	useEffect(() => {
		const element = ref.current
		if (!enabled || !element) return
		const entry = group(key)
		entry.heroes.push(hero)
		const observer = new IntersectionObserver(([item]) => {
			hero.visible = item.isIntersecting
			update(key)
		})
		observer.observe(element)
		return () => {
			observer.disconnect()
			entry.heroes.splice(entry.heroes.indexOf(hero), 1)
			hero.visible = false
			update(key)
		}
	}, [enabled, hero, ref, key])
	return useSyncExternalStore(subscribe, () => group(key).owner === hero, () => false)
}
