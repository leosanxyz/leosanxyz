import { useId } from 'react'
import type { StickerId } from '../../../shared/pass'
import { stickerArt } from './catalog'

/** A die-cut white edge follows the glyph's alpha, not its rectangular box. */
export function StickerArt({ art }: { art: StickerId }) {
	const id = `sticker-edge-${useId().replace(/:/g, '')}`
	return (
		<svg className="pass-sticker-art" viewBox="0 0 72 72" aria-hidden="true">
			<defs>
				<filter
					id={id}
					x="-35%"
					y="-35%"
					width="170%"
					height="170%"
					colorInterpolationFilters="sRGB"
				>
					<feMorphology
						in="SourceAlpha"
						operator="dilate"
						radius="3"
						result="edge"
					/>
					<feFlood floodColor="#fff" />
					<feComposite in2="edge" operator="in" />
					<feMerge>
						<feMergeNode />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<text
				x="36"
				y="52"
				textAnchor="middle"
				fontSize={art === 'code' ? 31 : 47}
				fontFamily="Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
				fontWeight="800"
				fill="#253329"
				filter={`url(#${id})`}
			>
				{stickerArt[art].glyph}
			</text>
		</svg>
	)
}
