'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type AvisoTono = 'blue' | 'amber' | 'sky' | 'rose'

const TONOS: Record<AvisoTono, { caja: string; titulo: string; boton: string }> = {
  blue: {
    caja: 'border-blue-200 bg-blue-50',
    titulo: 'text-blue-900',
    boton: 'text-blue-700 hover:text-blue-900',
  },
  amber: {
    caja: 'border-amber-200 bg-amber-50',
    titulo: 'text-amber-900',
    boton: 'text-amber-700 hover:text-amber-900',
  },
  sky: {
    caja: 'border-sky-200 bg-sky-50',
    titulo: 'text-sky-900',
    boton: 'text-sky-700 hover:text-sky-900',
  },
  rose: {
    caja: 'border-rose-200 bg-rose-50',
    titulo: 'text-rose-900',
    boton: 'text-rose-700 hover:text-rose-900',
  },
}

interface AvisoDesplegableProps {
  /** Lo que se ve siempre: una línea con el conteo ("3 empleado(s) con …"). */
  titulo: React.ReactNode
  tono: AvisoTono
  /** La explicación y la lista de empleados: solo se ve al abrir el aviso. */
  children: React.ReactNode
}

/**
 * Aviso del detalle de un periodo que arranca cerrado.
 *
 * Con muchos empleados, cada aviso abierto listaba a todos y la tabla quedaba
 * varias pantallas más abajo. Cerrado ocupa una línea, como una notificación,
 * y el detalle aparece solo cuando se toca.
 */
export function AvisoDesplegable({ titulo, tono, children }: AvisoDesplegableProps) {
  const [abierto, setAbierto] = useState(false)
  const idDetalle = useId()
  const colores = TONOS[tono]

  return (
    <div className={cn('rounded-2xl border', colores.caja)}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-controls={abierto ? idDetalle : undefined}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <span className={cn('text-sm font-semibold', colores.titulo)}>{titulo}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold transition',
            colores.boton
          )}
        >
          {abierto ? 'Ocultar' : 'Ver detalle'}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', abierto && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>
      {abierto && (
        <div id={idDetalle} className="px-4 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
