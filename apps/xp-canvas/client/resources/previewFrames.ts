/** A failed GPU copy can look like a valid JPEG containing only black pixels. */
export function hasVisiblePixels(rgba: Uint8ClampedArray) {
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] > 0 && Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) > 8) return true
	}
	return false
}

/** Try later frames if the clip starts with a black title fade or empty capture. */
export function previewSampleTimes(duration: number) {
	if (!Number.isFinite(duration) || duration <= 0) return [.2, 1, 2]
	return [...new Set([Math.min(.2, duration / 3), Math.min(1, duration / 2), duration / 2, duration * .8])]
}
