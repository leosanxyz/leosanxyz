export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/apng', 'image/avif']
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']
export const DOCUMENT_TYPES = [
	'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
	'application/zip', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const RESOURCE_MIME = 'application/x-xp-canvas-resource'
export type ResourceKind = 'image' | 'video' | 'audio' | 'document' | 'emoji'
export interface Resource {
	id: string
	name: string
	kind: ResourceKind
	src: string
	mimeType: string
	size: number
	w: number
	h: number
	createdAt: string
	previewSrc?: string
	folderId?: string | null
}

export interface ResourceFolder { id: string; name: string; parentId: string | null }
export interface ResourceFolders { folders: ResourceFolder[]; placements: Record<string, string | null> }

export function fileKind(mime: string): Exclude<ResourceKind, 'emoji'> | null {
	if (IMAGE_TYPES.includes(mime)) return 'image'
	if (VIDEO_TYPES.includes(mime)) return 'video'
	if (AUDIO_TYPES.includes(mime)) return 'audio'
	if (DOCUMENT_TYPES.includes(mime)) return 'document'
	return null
}

const EXTENSION_TYPES: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
	apng: 'image/apng', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
	mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf',
	txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', zip: 'application/zip',
	doc: DOCUMENT_TYPES[6], xls: DOCUMENT_TYPES[7], ppt: DOCUMENT_TYPES[8],
	docx: DOCUMENT_TYPES[9], xlsx: DOCUMENT_TYPES[10], pptx: DOCUMENT_TYPES[11],
}

export function getFileMime(file: { name: string; type: string }) {
	return fileKind(file.type) ? file.type : EXTENSION_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

export function formatBytes(size: number) {
	return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
}
