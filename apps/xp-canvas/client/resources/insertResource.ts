import { AssetRecordType, createShapeId, type Editor, type TLImageAsset, type TLVideoAsset, type VecLike } from 'tldraw'
import { insertEmoji } from '../emojis/insertEmoji'
import { type Resource } from '../../shared/resources'

export function insertResource(editor: Editor, resource: Resource, point?: VecLike) {
	if (editor.getIsReadonly()) throw new Error('Necesitas acceso de edición.')
	const center = point ?? editor.getViewportPageBounds().center
	if (resource.kind === 'emoji') return insertEmoji(editor, resource.src, center)
	const id = createShapeId()
	editor.markHistoryStoppingPoint('insert-resource')
	editor.run(() => {
		if (resource.kind === 'image' || resource.kind === 'video') {
			const assetId = AssetRecordType.createId(`resource-${resource.id}`)
			if (!editor.getAsset(assetId)) {
				const asset = AssetRecordType.create({ id: assetId, type: resource.kind,
					meta: resource.previewSrc ? { previewSrc: resource.previewSrc } : {},
					props: { src: resource.src, name: resource.name, w: resource.w, h: resource.h,
						mimeType: resource.mimeType, isAnimated: resource.kind === 'video' || ['image/gif', 'image/apng', 'image/webp', 'image/avif'].includes(resource.mimeType) },
				}) as TLImageAsset | TLVideoAsset
				editor.createAssets([asset])
			} else if (resource.previewSrc) {
				const asset = editor.getAsset(assetId)!
				editor.updateAssets([{ id: assetId, type: asset.type, meta: { ...asset.meta, previewSrc: resource.previewSrc } }])
			}
			const scale = Math.min(1, 640 / Math.max(resource.w, resource.h))
			const w = resource.w * scale, h = resource.h * scale
			editor.createShape({ id, type: resource.kind, x: center.x - w / 2, y: center.y - h / 2,
				props: { w, h, assetId, ...(resource.kind === 'video' ? { autoplay: false, playing: false } : {}) },
				meta: { resourceId: resource.id },
			})
		} else {
			const h = resource.kind === 'audio' ? 190 : 140
			editor.createShape({ id, type: 'resource', x: center.x - 160, y: center.y - h / 2,
				props: { w: 320, h, resourceId: resource.id, name: resource.name, src: resource.src, mimeType: resource.mimeType, size: resource.size },
			})
		}
		editor.setCurrentTool('select').select(id)
	})
	return id
}
