'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface TextoPlegableProps {
  children: React.ReactNode
  /** Clases del contenedor (caja, color, `flex-1` dentro de un flex, etc.). */
  className?: string
}

// useLayoutEffect avisa en el servidor; el efecto normal alcanza ahí.
const useEfectoDeMedida = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Texto de aviso que se ve en 2 líneas y se abre al tocarlo.
 *
 * Los avisos y mensajes largos empujaban todo lo demás hacia abajo. Aquí el
 * texto arranca recogido, como un recordatorio: si cabe en 2 líneas se ve tal
 * cual, sin flecha; si es más largo, se toca para ver todo y se vuelve a tocar
 * para recogerlo.
 *
 * El árbol es siempre el mismo (solo cambian atributos) para que la medida del
 * texto no se pierda al pasar de "cabe" a "no cabe".
 */
export function TextoPlegable({ children, className }: TextoPlegableProps) {
  const [abierto, setAbierto] = useState(false)
  const [desborda, setDesborda] = useState(false)
  const textoRef = useRef<HTMLSpanElement>(null)
  const idTexto = useId()

  const medir = useCallback(() => {
    const el = textoRef.current
    // Solo se mide recogido: abierto, el texto siempre "cabe".
    if (!el || abierto) return
    setDesborda(el.scrollHeight > el.clientHeight + 1)
  }, [abierto])

  useEfectoDeMedida(() => {
    medir()
  }, [medir, children])

  useEffect(() => {
    const el = textoRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(() => medir())
    observador.observe(el)
    return () => observador.disconnect()
  }, [medir])

  const plegable = desborda || abierto
  const alternar = () => setAbierto((v) => !v)

  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-1.5',
        plegable &&
          'cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
        className
      )}
      role={plegable ? 'button' : undefined}
      tabIndex={plegable ? 0 : undefined}
      aria-expanded={plegable ? abierto : undefined}
      aria-controls={plegable ? idTexto : undefined}
      title={plegable ? (abierto ? 'Tocar para recoger' : 'Tocar para ver todo') : undefined}
      onClick={plegable ? alternar : undefined}
      onKeyDown={
        plegable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                alternar()
              }
            }
          : undefined
      }
    >
      <span
        id={idTexto}
        ref={textoRef}
        className={cn('block min-w-0 flex-1', !abierto && 'line-clamp-2')}
      >
        {children}
      </span>
      {plegable && (
        <ChevronDown
          className={cn(
            'mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform',
            abierto && 'rotate-180'
          )}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
