import type { Editor, TLDrawShape } from 'tldraw'
import type { QuickShapeRecognition } from './classifier'

/** Ephemeral SVG: never enters the document, collaboration stream, exports, or undo history. */
export function createQuickShapePreview(editor: Editor) {
	const ns = 'http://www.w3.org/2000/svg'
	const svg = document.createElementNS(ns, 'svg')
	svg.classList.add('quick-shape-preview')
	svg.setAttribute('aria-hidden', 'true')
	svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:300;overflow:hidden;display:none'
	const pageGroup = document.createElementNS(ns, 'g')
	const localGroup = document.createElementNS(ns, 'g')
	pageGroup.appendChild(localGroup); svg.appendChild(pageGroup)
	editor.getContainer().appendChild(svg)
	let lastGeometry = ''
	return {
		show(shape: TLDrawShape, recognition: QuickShapeRecognition) {
			const transform = editor.getShapePageTransform(shape)
			if (!transform) return
			const camera = editor.getCamera(), z = camera.z
			pageGroup.setAttribute('transform', `matrix(${transform.a * z} ${transform.b * z} ${transform.c * z} ${transform.d * z} ${(transform.e + camera.x) * z} ${(transform.f + camera.y) * z})`)
			const geometry = JSON.stringify(recognition)
			if (geometry !== lastGeometry) {
				lastGeometry = geometry; localGroup.replaceChildren()
				let element: SVGElement
				if (recognition.kind === 'line') {
					localGroup.removeAttribute('transform')
					element = document.createElementNS(ns, 'line')
					for (const [name, value] of Object.entries({ x1: recognition.start.x, y1: recognition.start.y, x2: recognition.end.x, y2: recognition.end.y })) element.setAttribute(name, String(value))
				} else {
					const { x, y, w, h } = recognition.bounds
					localGroup.setAttribute('transform', `translate(${x} ${y}) rotate(${recognition.rotation * 180 / Math.PI})`)
					if (recognition.kind === 'ellipse') {
						element = document.createElementNS(ns, 'ellipse')
						for (const [name, value] of Object.entries({ cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 })) element.setAttribute(name, String(value))
					} else if (recognition.kind === 'triangle') {
						element = document.createElementNS(ns, 'polygon'); element.setAttribute('points', `${w / 2},0 ${w},${h} 0,${h}`)
					} else {
						element = document.createElementNS(ns, 'rect'); element.setAttribute('width', String(w)); element.setAttribute('height', String(h))
					}
				}
				element.setAttribute('fill', recognition.kind === 'line' ? 'none' : '#0b9cbc12')
				element.setAttribute('stroke', '#079abc')
				element.setAttribute('stroke-opacity', '.8')
				element.setAttribute('stroke-width', '2')
				element.setAttribute('stroke-dasharray', '5 4')
				element.setAttribute('vector-effect', 'non-scaling-stroke')
				localGroup.appendChild(element)
			}
			svg.style.display = 'block'
		},
		hide() { svg.style.display = 'none' },
		dispose() { svg.remove() },
	}
}
