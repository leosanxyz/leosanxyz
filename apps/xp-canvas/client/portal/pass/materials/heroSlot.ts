import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

// One live WebGL context per page: the first hero in mount order that is on screen owns it.
type Hero = { visible: boolean }
const heroes: Hero[] = []
const listeners = new Set<() => void>()
let owner: Hero | null = null

function update() {
	const next = heroes.find((hero) => hero.visible) ?? null
	if (next === owner) return
	owner = next
	for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function useHeroSlot(ref: RefObject<HTMLElement | null>, enabled: boolean) {
	const [hero] = useState<Hero>(() => ({ visible: false }))
	useEffect(() => {
		const element = ref.current
		if (!enabled || !element) return
		heroes.push(hero)
		const observer = new IntersectionObserver(([entry]) => {
			hero.visible = entry.isIntersecting
			update()
		})
		observer.observe(element)
		return () => {
			observer.disconnect()
			heroes.splice(heroes.indexOf(hero), 1)
			hero.visible = false
			update()
		}
	}, [enabled, hero, ref])
	return useSyncExternalStore(subscribe, () => owner === hero, () => false)
}
