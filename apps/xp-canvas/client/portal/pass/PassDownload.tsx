import { useRef, useState, type RefObject } from 'react'
import { Icon } from '../../components/Icon'

export function passFilename(name: string) {
	const slug = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
	return `pase-xp${slug ? `-${slug}` : ''}.png`
}

export function PassDownload({
	stage,
	name,
	iconOnly = false,
	side = 'front',
}: {
	stage: RefObject<HTMLDivElement | null>
	name: string
	iconOnly?: boolean
	side?: 'front' | 'back'
}) {
	const [busy, setBusy] = useState(false),
		[error, setError] = useState('')
	const working = useRef(false)
	async function download() {
		if (working.current) return
		working.current = true
		setBusy(true)
		setError('')
		try {
			const selector = side === 'back' ? '.pass-card-back' : '.pass-front'
			const face = stage.current?.querySelector<HTMLElement>(
				`.pass-carousel-card[data-selected="true"] ${selector}`,
			) ?? stage.current?.querySelector<HTMLElement>(selector)
			if (!face) throw new Error('La tarjeta todavía no está lista.')
			await document.fonts.ready
			await Promise.all(
				Array.from(face.querySelectorAll('img'), (image) => image.decode()),
			)
			const { toBlob } = await import('html-to-image')
			const width = face.offsetWidth,
				height = face.offsetHeight
			const blob = await toBlob(face, {
				width,
				height,
				pixelRatio: 1200 / width,
				fontEmbedCSS: '',
				style: {
					transform: 'none',
					position: 'relative',
					inset: 'auto',
					margin: '0',
					boxShadow: 'none',
					visibility: 'visible',
					width: `${width}px`,
					height: `${height}px`,
				},
				filter: (node) =>
					!(
						node instanceof Element &&
						node.classList.contains('pass-sticker-frame')
					),
			})
			if (!blob)
				throw new Error('No pude crear la imagen. Vuelve a intentarlo.')
			const url = URL.createObjectURL(blob),
				link = document.createElement('a')
			link.download = side === 'back' ? passFilename(name).replace('.png', '-reverso.png') : passFilename(name)
			link.href = url
			document.body.appendChild(link)
			link.click()
			link.remove()
			setTimeout(() => URL.revokeObjectURL(url), 30_000)
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: 'No pude crear la imagen. Vuelve a intentarlo.',
			)
		} finally {
			working.current = false
			setBusy(false)
		}
	}
	return (
		<div className={`pass-download${iconOnly ? ' pass-download--icon' : ''}`}>
			<button
				className={iconOnly ? 'xp-icon-button' : 'pass-tool'}
				onClick={() => void download()}
				disabled={busy}
				aria-busy={busy}
				aria-label={iconOnly ? busy ? 'Preparando imagen…' : 'Descargar imagen' : undefined}
				title={iconOnly ? 'Descargar imagen' : undefined}
			>
				<Icon name="download" />
				{!iconOnly && (busy ? 'Preparando imagen…' : 'Descargar imagen')}
			</button>
			{error && <p role="alert">{error}</p>}
		</div>
	)
}
