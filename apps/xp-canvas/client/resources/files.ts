import { uniqueId } from 'tldraw'
import { fileKind, getFileMime, MAX_FILE_BYTES, MAX_IMAGE_BYTES, type Resource } from '../../shared/resources'
import { videoPreview } from './videoPreview'

export async function uploadFile(file: File, options: { save?: boolean; w?: number; h?: number; previewId?: string } = {}) {
	const mime = getFileMime(file)
	const kind = fileKind(mime)
	if (!kind) throw new Error('Formato no compatible. Usa imágenes, videos, audio, PDF, Office, texto o ZIP.')
	const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
	if (!file.size || file.size > limit) throw new Error(`El archivo debe tener contenido y pesar menos de ${limit / 1024 / 1024} MB.`)
	const response = await fetch(`/api/uploads/${uniqueId()}`, {
		method: 'POST', body: file,
		headers: {
			'content-type': mime, 'x-file-name': encodeURIComponent(file.name),
			'x-save-resource': String(options.save ?? false),
			'x-asset-width': String(options.w ?? 320), 'x-asset-height': String(options.h ?? 180),
			...(options.previewId ? { 'x-resource-preview': options.previewId } : {}),
		},
	})
	if (!response.ok) {
		if (response.status === 403) throw new Error('Tu sesión de editor terminó. Vuelve a entrar para subir archivos.')
		if (response.status === 400) throw new Error('El contenido del archivo no coincide con su formato.')
		throw new Error(`No se pudo guardar ${file.name} (${response.status}). Intenta de nuevo.`)
	}
	return (await response.json() as { resource: Resource }).resource
}

export async function uploadLibraryFile(file: File) {
	const mime = getFileMime(file)
	const kind = fileKind(mime)
	const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
	if (!kind || file.size > limit || !file.size) return uploadFile(file, { save: true })
	if (kind !== 'image' && kind !== 'video') return uploadFile(file, { save: true })
	const url = URL.createObjectURL(file)
	if (kind === 'video') {
		let previewId: string | undefined, w = 320, h = 180
		try {
			try {
				const preview = await videoPreview(url)
				w = preview.w; h = preview.h
				previewId = (await uploadFile(preview.file)).id
			} catch { /* A preview failure must not discard the original resource. */ }
			return await uploadFile(file, { save: true, w, h, previewId })
		} finally { URL.revokeObjectURL(url) }
	}
	const media = new Image()
	try {
		const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
			const timeout = window.setTimeout(() => finish(new Error('No pude leer este archivo multimedia.')), 15_000)
			const finish = (error?: Error) => {
				clearTimeout(timeout)
				if (error) { reject(error); return }
				const w = media.naturalWidth, h = media.naturalHeight
				if (!w || !h) reject(new Error('El archivo no tiene dimensiones válidas.'))
				else resolve({ w, h })
			}
			media.onload = () => finish()
			media.onerror = () => finish(new Error('El navegador no puede leer este formato. Prueba PNG, GIF o MP4.'))
			media.src = url
		})
		let previewId: string | undefined
		if (mime !== 'image/jpeg' && mime !== 'image/png' || Math.max(dimensions.w, dimensions.h) > 256) {
			try {
				const canvas = document.createElement('canvas')
				const scale = Math.min(1, 256 / Math.max(dimensions.w, dimensions.h))
				canvas.width = Math.max(1, Math.round(dimensions.w * scale)); canvas.height = Math.max(1, Math.round(dimensions.h * scale))
				canvas.getContext('2d')!.drawImage(media, 0, 0, canvas.width, canvas.height)
				const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .75))
				if (blob) previewId = (await uploadFile(new File([blob], 'preview.webp', { type: blob.type }), { w: canvas.width, h: canvas.height })).id
				canvas.width = canvas.height = 0
			} catch { /* A preview failure must not discard the original resource. */ }
		}
		return await uploadFile(file, { save: true, ...dimensions, previewId })
	} finally {
		media.onload = null; media.onerror = null; media.removeAttribute('src')
		URL.revokeObjectURL(url)
	}
}
