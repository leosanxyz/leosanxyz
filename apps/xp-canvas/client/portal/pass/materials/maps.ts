/**
 * Card art name: the artwork file name without folder or extension, as in `design/gachapon` and `design/pass-skins`.
 * Built asset URLs carry Vite's 8-character hash after a dash; `hashed` removes it.
 */
export const artName = (url: string, hashed = false) => {
	const name = url.split(/[?#]/)[0].split('/').pop()!.replace(/\.[^.]+$/, '')
	return hashed ? name.replace(/-[\w-]{8}$/, '') : name
}

export type MaskSource = { kind: 'png'; url: string } | { kind: 'vector' } | { kind: 'oval' }
export type DepthSource = { kind: 'png'; url: string } | { kind: 'luminance' }

/**
 * Painted maps win over the vector mask and over relief computed from the art.
 * `files` maps each found file path (`…/mapas/<name>/mask.png`) to its URL.
 */
export function chooseMaps(name: string | undefined, files: Record<string, string>, hasVector: boolean): { mask: MaskSource; depth: DepthSource } {
	const find = (file: string) => name ? Object.entries(files).find(([path]) => path.endsWith(`/mapas/${name}/${file}`))?.[1] : undefined
	const mask = find('mask.png'), depth = find('depth.png')
	return {
		mask: mask ? { kind: 'png', url: mask } : hasVector ? { kind: 'vector' } : { kind: 'oval' },
		depth: depth ? { kind: 'png', url: depth } : { kind: 'luminance' },
	}
}

/** Destination rect for drawing an image into a W × H box with CSS object-fit and object-position. */
export function fitRect(iw: number, ih: number, w: number, h: number, position = '50% 50%', fit: 'cover' | 'contain' = 'cover') {
	const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
	const dw = iw * scale, dh = ih * scale
	const [px, py] = position.split(/\s+/).concat('50%').slice(0, 2).map((v) => v === 'center' ? 0.5 : v === 'left' || v === 'top' ? 0 : v === 'right' || v === 'bottom' ? 1 : parseFloat(v) / 100)
	return { x: (w - dw) * px, y: (h - dh) * py, w: dw, h: dh }
}
