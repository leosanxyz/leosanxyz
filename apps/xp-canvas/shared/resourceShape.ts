import { T } from '@tldraw/validate'
import type { TLShape } from '@tldraw/tlschema'

// Kept identical on the sync server and the browser. URLs are limited to our file endpoint.
export const resourceShapeProps = {
	w: T.positiveNumber,
	h: T.positiveNumber,
	resourceId: T.string,
	name: T.string,
	src: T.string.refine((value) => {
		if (value !== '' && !/^\/api\/uploads\/[a-zA-Z0-9_-]{12,64}$/.test(value)) {
			throw new Error('Invalid resource URL')
		}
		return value
	}),
	mimeType: T.string,
	size: T.number,
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		resource: {
			w: number; h: number; resourceId: string; name: string; src: string; mimeType: string; size: number
		}
	}
}
export type ResourceShape = TLShape<'resource'>
