import { AssetRecordType, createShapeId, type Editor, type VecLike } from 'tldraw'

/** Bake the platform's emoji glyph into a transparent sticker, not an editable text box. */
export function insertEmoji(editor: Editor, emoji: string, point: VecLike) {
	if (editor.getIsReadonly()) return
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 256
	const context = canvas.getContext('2d')!
	context.font = '200px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
	context.textAlign = 'center'; context.textBaseline = 'middle'
	context.fillText(emoji, 128, 140, 240)
	const src = canvas.toDataURL('image/png')
	canvas.width = canvas.height = 0
	const assetId = AssetRecordType.createId(), id = createShapeId()
	editor.markHistoryStoppingPoint('insert-emoji')
	editor.run(() => {
		editor.createAssets([AssetRecordType.create({ id: assetId, type: 'image', meta: {},
			props: { src, name: emoji, w: 256, h: 256, mimeType: 'image/png', isAnimated: false } })])
		editor.createShape({ id, type: 'image', x: point.x - 48, y: point.y - 48,
			props: { assetId, w: 96, h: 96 }, meta: { emoji } }).setCurrentTool('select').select(id)
	})
	return id
}
