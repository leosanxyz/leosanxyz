import { ImageShapeUtil, TextShapeUtil, type TLImageShape, type TLTextShape } from 'tldraw'

export class CanvasImageShapeUtil extends ImageShapeUtil {
	override canEdit(...args: Parameters<ImageShapeUtil['canEdit']>) { return !args[0].meta.emoji && super.canEdit(...args) }
	override canCrop(shape: TLImageShape) { return !shape.meta.emoji && super.canCrop(shape) }
	// A truthy no-op consumes double-click; otherwise Select creates a new text box.
	override onDoubleClick(shape: TLImageShape) { return shape.meta.emoji ? shape : undefined }
}

// Keep already-saved emoji text compatible without rewriting the user's document.
export class CanvasTextShapeUtil extends TextShapeUtil {
	override onDoubleClick(shape: TLTextShape) { return this.canEdit(shape) ? undefined : shape }
	override canEdit(shape: TLTextShape) {
		const text = this.getText(shape).trim()
		const singleGlyph = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length === 1
		return !(singleGlyph && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text)) && super.canEdit(shape)
	}
}
