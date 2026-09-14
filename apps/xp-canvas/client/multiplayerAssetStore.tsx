import { TLAssetStore } from 'tldraw'
import { uploadFile } from './resources/files'
import { MAX_FILE_BYTES } from '../shared/resources'

export const MAX_ASSET_BYTES = MAX_FILE_BYTES

export function createMultiplayerAssetStore(canEdit: boolean): TLAssetStore {
	return {
		async upload(asset, file) {
			if (!canEdit) throw new Error('Necesitas acceso de edición para subir archivos.')
			const props = asset?.props
			const resource = await uploadFile(file, props && 'w' in props ? { w: props.w, h: props.h } : {})
			return { src: resource.src }
		},

		resolve(asset) {
			return asset.props.src
		},
	}
}
