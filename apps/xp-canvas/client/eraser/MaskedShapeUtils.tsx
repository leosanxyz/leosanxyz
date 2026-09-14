import { Box, Circle2d, DrawShapeUtil, GeoShapeUtil, HighlightShapeUtil, LineShapeUtil, getDisplayValues, getPointsFromDrawSegments,
	type SvgExportContext, type TLDrawShape, type TLGeoShape, type TLHighlightShape, type TLLineShape } from 'tldraw'
import { MaskedShape, MaskedSvg } from './MaskedShape'
import { maskedGeometry } from './eraseMask'

export class MaskedDrawShapeUtil extends DrawShapeUtil {
	getUnmaskedGeometry(shape: TLDrawShape): ReturnType<DrawShapeUtil['getGeometry']> {
		const native = super.getGeometry(shape)
		if (!(native instanceof Circle2d)) return native
		// Legacy fragments can contain points far from their shape origin. The native
		// dot geometry assumes (0,0), while the visible dot uses those actual points.
		const points = getPointsFromDrawSegments(shape.props.segments, shape.props.scaleX, shape.props.scaleY)
		if (!points.length) return native
		const center = Box.FromPoints(points).center, radius = Math.abs((getDisplayValues(this, shape).strokeWidth + 1) * shape.props.scale)
		return new Circle2d({ x: center.x - radius, y: center.y - radius, radius, isFilled: true })
	}
	override getGeometry(shape: TLDrawShape) { return maskedGeometry(shape, this.getUnmaskedGeometry(shape)) }
	override component(shape: TLDrawShape) { return <MaskedShape shape={shape} bounds={this.getUnmaskedGeometry(shape).bounds}>{super.component(shape)}</MaskedShape> }
	override toSvg(shape: TLDrawShape, ctx: SvgExportContext) { return <MaskedSvg shape={shape} bounds={this.getUnmaskedGeometry(shape).bounds}>{super.toSvg(shape, ctx)}</MaskedSvg> }
}

export class MaskedHighlightShapeUtil extends HighlightShapeUtil {
	getUnmaskedGeometry(shape: TLHighlightShape): ReturnType<HighlightShapeUtil['getGeometry']> {
		const native = super.getGeometry(shape)
		if (!(native instanceof Circle2d)) return native
		const points = getPointsFromDrawSegments(shape.props.segments, shape.props.scaleX, shape.props.scaleY)
		if (!points.length) return native
		const center = Box.FromPoints(points).center, radius = Math.abs(getDisplayValues(this, shape).strokeWidth * shape.props.scale / 2)
		return new Circle2d({ x: center.x - radius, y: center.y - radius, radius, isFilled: true })
	}
	override getGeometry(shape: TLHighlightShape) { return maskedGeometry(shape, this.getUnmaskedGeometry(shape)) }
	override component(shape: TLHighlightShape) { const native = super.component(shape); return <MaskedShape shape={shape} bounds={this.getUnmaskedGeometry(shape).bounds}>{native}</MaskedShape> }
	override backgroundComponent(shape: TLHighlightShape) { const native = super.backgroundComponent(shape); return <MaskedShape shape={shape} bounds={this.getUnmaskedGeometry(shape).bounds}>{native}</MaskedShape> }
	override toSvg(shape: TLHighlightShape, ctx: SvgExportContext) { return <MaskedSvg shape={shape} bounds={this.getUnmaskedGeometry(shape).bounds}>{super.toSvg(shape, ctx)}</MaskedSvg> }
	override toBackgroundSvg(shape: TLHighlightShape, ctx: SvgExportContext) { return <MaskedSvg shape={shape} bounds={this.getUnmaskedGeometry(shape).bounds}>{super.toBackgroundSvg(shape, ctx)}</MaskedSvg> }
}

export class MaskedGeoShapeUtil extends GeoShapeUtil {
	getUnmaskedGeometry(shape: TLGeoShape) { return super.getGeometry(shape) }
	override getGeometry(shape: TLGeoShape) { return maskedGeometry(shape, super.getGeometry(shape)) }
	override component(shape: TLGeoShape) { return <MaskedShape shape={shape} bounds={super.getGeometry(shape).bounds}>{super.component(shape)}</MaskedShape> }
	override toSvg(shape: TLGeoShape, ctx: SvgExportContext) { return <MaskedSvg shape={shape} bounds={super.getGeometry(shape).bounds}>{super.toSvg(shape, ctx)}</MaskedSvg> }
}

export class MaskedLineShapeUtil extends LineShapeUtil {
	getUnmaskedGeometry(shape: TLLineShape) { return super.getGeometry(shape) }
	override getGeometry(shape: TLLineShape) { return maskedGeometry(shape, super.getGeometry(shape)) }
	override component(shape: TLLineShape) { return <MaskedShape shape={shape} bounds={super.getGeometry(shape).bounds}>{super.component(shape)}</MaskedShape> }
	override toSvg(shape: TLLineShape, ctx: SvgExportContext) { return <MaskedSvg shape={shape} bounds={super.getGeometry(shape).bounds}>{super.toSvg(shape, ctx)}</MaskedSvg> }
}

export const MASKED_SHAPE_UTILS = [MaskedDrawShapeUtil, MaskedHighlightShapeUtil, MaskedGeoShapeUtil, MaskedLineShapeUtil]
