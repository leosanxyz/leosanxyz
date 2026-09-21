import { BaseBoxShapeUtil, HTMLContainer, defaultShapeUtils } from 'tldraw'
import { QuestionShapeUtil } from '../questions/QuestionShapeUtil'
import { CanvasVideoShapeUtil } from './CanvasVideoShapeUtil'
import { CanvasImageShapeUtil, CanvasTextShapeUtil } from '../emojis/EmojiShapeUtils'
import { MASKED_SHAPE_UTILS } from '../eraser/MaskedShapeUtils'
import { resourceShapeProps, type ResourceShape } from '../../shared/resourceShape'
import { formatBytes } from '../../shared/resources'
import './resources.css'

export class ResourceShapeUtil extends BaseBoxShapeUtil<ResourceShape> {
	static override type = 'resource' as const
	static override props = resourceShapeProps
	override getDefaultProps(): ResourceShape['props'] {
		return { w: 320, h: 140, resourceId: '', name: 'Documento', src: '', mimeType: '', size: 0 }
	}
	override canEdit() { return false }
	override getText(shape: ResourceShape) { return shape.props.name }
	override component(shape: ResourceShape) {
		const { name, src, mimeType, size } = shape.props
		const audio = mimeType.startsWith('audio/')
		const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
		return (
			<HTMLContainer className="resource-shape">
				<span className="resource-shape__icon" aria-hidden="true">{audio ? '♫' : '▤'}</span>
				<strong>{name}</strong>
				<small>{formatBytes(size)} · {audio ? 'Audio' : 'Documento'}</small>
				{audio && <audio src={src} controls preload="none" onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} />}
				<a href={src} target="_blank" rel="noopener noreferrer" draggable={false}
					onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop}>
					{audio ? 'Descargar audio' : 'Abrir / descargar'}
				</a>
			</HTMLContainer>
		)
	}
	override getIndicatorPath(shape: ResourceShape) {
		const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path
	}
	override toSvg(shape: ResourceShape) {
		return <g><rect width={shape.props.w} height={shape.props.h} fill="#fffdfa" stroke="#bbb7ae" rx="12" />
			<text x="18" y="36" fontSize="16" fill="#24231f">{shape.props.name.slice(0, 40)}</text>
			<text x="18" y="64" fontSize="12" fill="#6b6861">{formatBytes(shape.props.size)}</text></g>
	}
}

export const CANVAS_SHAPE_UTILS = [
	...defaultShapeUtils.filter((util) => !['video', 'image', 'text', 'draw', 'highlight', 'geo', 'line'].includes(util.type)),
	...MASKED_SHAPE_UTILS,
	ResourceShapeUtil, QuestionShapeUtil, CanvasImageShapeUtil, CanvasTextShapeUtil, CanvasVideoShapeUtil.configure({ autoplay: false }),
]
