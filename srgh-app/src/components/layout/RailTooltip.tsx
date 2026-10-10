'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TooltipState {
  label: string
  top: number
  left: number
}

interface RailTooltipAreaProps {
  /** Solo en el riel colapsado: expandido, las etiquetas ya estan a la vista. */
  enabled: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Contenedor del menu que muestra el nombre de cada icono del riel al pasar el
 * puntero o al llegar con Tab. Un solo tooltip para todo el riel, por
 * delegacion sobre los elementos con `data-tooltip`.
 *
 * Va en un portal a `document.body` con `position: fixed`, por dos razones:
 * - El `<aside>` y su scroller tienen `overflow-hidden`/`overflow-y-auto`, que
 *   recortarian cualquier tooltip posicionado adentro.
 * - El `<aside>` es `sticky`, asi que arma su propio contexto de apilamiento:
 *   un `fixed` adentro quedaria debajo de los encabezados sticky de las tablas.
 *
 * Es `aria-hidden`: el nombre accesible de cada link es su propia etiqueta, que
 * sigue en el DOM (solo transparente). Anunciar el tooltip lo leeria dos veces.
 */
export function RailTooltipArea({ enabled, className, children }: RailTooltipAreaProps) {
  const areaRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TooltipState | null>(null)

  function show(target: EventTarget | null) {
    const area = areaRef.current
    const item =
      enabled && target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null
    if (!area || !item) {
      setTip(null)
      return
    }
    const rect = item.getBoundingClientRect()
    setTip({
      label: item.dataset.tooltip ?? '',
      top: rect.top + rect.height / 2,
      left: area.getBoundingClientRect().right + 8,
    })
  }

  const hide = () => setTip(null)

  return (
    <div
      ref={areaRef}
      // Lo busca RailFlyout para abrir su panel junto al borde del riel.
      data-rail-area=""
      className={className}
      // En tactil no hay "pasar por encima": el tooltip quedaria pegado al
      // ultimo icono tocado.
      onPointerOver={(event) => (event.pointerType === 'touch' ? hide() : show(event.target))}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => show(event.target)}
      onBlur={hide}
      onScroll={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide()
      }}
    >
      {children}
      {enabled &&
        tip &&
        createPortal(
          <span
            key={tip.label}
            data-rail-tooltip=""
            aria-hidden="true"
            style={{ top: tip.top, left: tip.left }}
            className="animate-fade-in pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
          >
            {tip.label}
          </span>,
          document.body
        )}
    </div>
  )
}
