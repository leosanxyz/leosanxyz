const wrap = (v: number) => ((v % 360) + 360) % 360

export function foilPattern(phase: number) {
	return {
		rotation: 15 + phase * 145,
		scale: 0.65 + 0.8 * (0.5 + Math.sin(phase * Math.PI * 2) / 2),
	}
}

// Pointer position locates the lamp; tilt changes the reflected color.
// The infinity control edits the print separately from the light.
export function foilLighting(
	rx: number,
	ry: number,
	hue: number,
	x: number,
	y: number,
) {
	const direction = 112 - ry * 3 + rx * 2
	// The multicolor stop at the end selects full-spectrum foil.
	const rainbow = hue === 360
	const tint = wrap((rainbow ? 0 : hue) + ry * 2 + rx * 1.5)
	const color = (offset: number, alpha: number) =>
		`hsl(${wrap(tint + offset).toFixed(1)} 100% 56% / ${alpha})`
	const offsets = rainbow
		? [0, 60, 120, 180, 240, 300, 360]
		: [-35, 0, 30, 70, 30, 0, -35]
	const stops = [0, 14, 28, 40, 52, 68, 80]
	const alpha = [0.9, 0.95, 0.9, 0.75, 0.85, 0.95, 0.9]
	const spectrum = offsets
		.map(
			(offset, i) =>
				`${color(offset, alpha[i])} ${(stops[i] / (rainbow ? 3 : 1)).toFixed(2)}%`,
		)
		.join(', ')
	return {
		spectrum: `repeating-linear-gradient(${direction.toFixed(1)}deg, ${spectrum})`,
		illumination: `radial-gradient(ellipse 92% 65% at ${x.toFixed(2)}% ${y.toFixed(2)}%, #fff 0%, #fffd 15%, #fff5 45%, #fff1 75%, #fff0 100%)`,
		glare: `radial-gradient(ellipse 62% 38% at ${x.toFixed(2)}% ${y.toFixed(2)}%, #ffffff70 0%, #ffffff18 32%, #ffffff00 73%)`,
	}
}
