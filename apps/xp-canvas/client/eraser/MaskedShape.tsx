import { Children, Fragment, cloneElement, isValidElement, useId, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { HTMLContainer, SVGContainer, type Box, type TLShape } from 'tldraw'
import { eraseFrame, getEraseMask, maskPaths } from './eraseMask'

function MaskDefinition({ shape, bounds, id, scale = 1 }: { shape: TLShape; bounds: Box; id: string; scale?: number }) {
	const mask = getEraseMask(shape), frame = eraseFrame(shape, bounds)
	const pad = 64 * Math.max(1, 'scale' in shape.props ? Math.abs(shape.props.scale as number) : 1)
	const region = { x: (bounds.x - pad) / scale, y: (bounds.y - pad) / scale,
		width: (Math.max(1, bounds.w) + 2 * pad) / scale, height: (Math.max(1, bounds.h) + 2 * pad) / scale }
	return <mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" {...region} style={{ maskType: 'luminance' }}>
		<rect {...region} fill="white" />
		{mask && maskPaths(mask, frame, scale).map((path, index) =>
			<path key={index} {...path} fill="none" stroke="black" strokeLinecap="round" strokeLinejoin="round" />)}
	</mask>
}

/** Keep the native SVG and ink mounted, even before the first erase. Never load a mask image. */
export function MaskedShape({ shape, bounds, children }: { shape: TLShape; bounds: Box; children: ReactNode }) {
	const id = `erase-live-${useId().replace(/[^\w-]/g, '')}`
	const mask = getEraseMask(shape), maskUrl = mask ? `url(#${id})` : undefined
	function wrap(nodes: ReactNode): ReactNode {
		return Children.map(nodes, node => {
			if (!isValidElement(node)) return node
			const element = node as ReactElement<{ children?: ReactNode; style?: CSSProperties }>
			if (element.type === Fragment) return cloneElement(element, {}, wrap(element.props.children))
			if (element.type === SVGContainer) return cloneElement(element, {},
				<defs key="erase-defs"><MaskDefinition shape={shape} bounds={bounds} id={id} /></defs>,
				<g key="erase-ink" data-erase-ink mask={maskUrl}>{element.props.children}</g>)
			// Geo labels are HTML. Reference the same live definition, without a data URL
			// or an extra wrapper that would remount the editable label on the first cut.
			if (element.type === HTMLContainer) return cloneElement(element, {
				style: { ...element.props.style, maskImage: maskUrl, WebkitMaskImage: maskUrl },
			})
			return node
		})
	}
	return wrap(children)
}

export function MaskedSvg({ shape, bounds, children }: { shape: TLShape; bounds: Box; children: ReactNode }) {
	const id = `erase-export-${useId().replace(/[^\w-]/g, '')}`
	if (!getEraseMask(shape)) return children
	const scale = 'scale' in shape.props ? shape.props.scale as number : 1
	return <g><defs><MaskDefinition shape={shape} bounds={bounds} id={id} scale={scale} /></defs><g mask={`url(#${id})`}>{children}</g></g>
}
