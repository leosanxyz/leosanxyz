import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor } from 'tldraw'
import { esquivaShapeProps, type EsquivaShape } from '../../shared/esquivaShape'
import { Icon } from '../components/Icon'
import { useQuestion } from '../questions/QuestionContext'
import { DemoEsquiva, VERSIONES_ESQUIVA } from './motor'
import './esquiva.css'

// Medidas de diseño. La figura escala todo el contenido, así se ve igual a cualquier tamaño.
const ANCHO = 1060
const ALTO = 600

export class EsquivaShapeUtil extends BaseBoxShapeUtil<EsquivaShape> {
	static override type = 'esquiva' as const
	static override props = esquivaShapeProps
	override getDefaultProps(): EsquivaShape['props'] { return { w: ANCHO, h: ALTO, paso: 0, antes: false } }
	override canEdit() { return false }
	override isAspectRatioLocked() { return true }
	override getText() { return 'Esquiva, paso a paso' }
	override getIndicatorPath(shape: EsquivaShape) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w, shape.props.h, 16 * shape.props.w / ANCHO); return p }
	override component(shape: EsquivaShape) { return <Demo shape={shape} /> }
	override toSvg(shape: EsquivaShape) {
		const escala = shape.props.w / ANCHO
		return <g transform={`scale(${escala})`}>
			<rect width={ANCHO} height={ALTO} rx={16} fill="#fffdfa" stroke="#c9c5bc" />
			<text x={24} y={50} fontSize={24} fontWeight={700} fill="#24231f">Esquiva, paso a paso</text>
			<text x={24} y={84} fontSize={16} fill="#6b6861">{VERSIONES_ESQUIVA[shape.props.paso].titulo}</text>
			<rect x={293} y={20} width={747} height={560} rx={12} fill="#2d132c" />
		</g>
	}
}

function Demo({ shape }: { shape: EsquivaShape }) {
	const editor = useEditor()
	const { isTeacher } = useQuestion()
	const lienzo = useRef<HTMLCanvasElement>(null)
	const demo = useRef<DemoEsquiva | null>(null)
	const [sonido, setSonido] = useState(false)
	const { paso, antes } = shape.props

	useEffect(() => {
		const canvas = lienzo.current!
		const instancia = new DemoEsquiva(canvas, paso, antes)
		demo.current = instancia
		// Fuera de la vista no se simula nada.
		const observador = new IntersectionObserver(([entrada]) => instancia.pausar(!entrada.isIntersecting))
		observador.observe(canvas)
		return () => {
			observador.disconnect()
			instancia.destruir()
			demo.current = null
		}
		// La demo se crea una sola vez; los cambios de versión llegan por el efecto de abajo.
	}, [])
	useEffect(() => { demo.current?.ponerPaso(paso, antes) }, [paso, antes])

	// La versión y el "ver el inicio" se guardan en la figura para que todos los vean. No entran al historial.
	const actualizar = (props: Partial<EsquivaShape['props']>) => editor.run(() => editor.updateShape<EsquivaShape>({ id: shape.id, type: 'esquiva', props }), { history: 'ignore' })
	const detener = (event: { stopPropagation(): void }) => event.stopPropagation()
	const guard = { onPointerDown: detener, onTouchStart: detener, onTouchEnd: detener }

	return <HTMLContainer className="esquiva" style={{ width: shape.props.w, height: shape.props.h }}>
		<div className="esquiva__contenido" style={{ width: ANCHO, height: ALTO, transform: `scale(${shape.props.w / ANCHO})` }}>
			<aside className="esquiva__lado">
				<h2>Esquiva, paso a paso</h2>
				<ol className="esquiva__versiones" data-interactiva={isTeacher}>
					{VERSIONES_ESQUIVA.map((version, i) => <li key={version.titulo}>
						<button type="button" aria-pressed={i === paso} disabled={!isTeacher} {...guard} onClick={() => actualizar({ paso: i, antes: false })}>
							<b>{version.titulo}</b><span>{version.detalle}</span>
						</button>
					</li>)}
				</ol>
				<div className="esquiva__acciones">
					{isTeacher && <button type="button" className="esquiva__icono" aria-pressed={antes} aria-label="Mantén para ver el inicio" title="Mantén para ver el inicio"
						onPointerDown={(event) => { detener(event); actualizar({ antes: true }) }} onTouchStart={detener} onTouchEnd={detener}
						onPointerUp={() => actualizar({ antes: false })} onPointerLeave={() => antes && actualizar({ antes: false })} onPointerCancel={() => actualizar({ antes: false })}>
						<Icon name="recent" size={22} />
					</button>}
					<button type="button" className="esquiva__icono" aria-pressed={sonido} aria-label={sonido ? 'Silenciar' : 'Activar sonido en este dispositivo'} title={sonido ? 'Silenciar' : 'Activar sonido en este dispositivo'}
						{...guard} onClick={() => { demo.current?.ponerSonido(!sonido); setSonido(!sonido) }}>
						<Icon name="audio" size={22} />
					</button>
				</div>
			</aside>
			<canvas ref={lienzo} className="esquiva__lienzo" aria-label={`Demo de Esquiva: ${VERSIONES_ESQUIVA[paso].titulo}`} />
		</div>
	</HTMLContainer>
}
