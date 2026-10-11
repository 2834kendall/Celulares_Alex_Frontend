'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface CollapsibleSectionProps {
  title: string
  icon?: LucideIcon
  /** Resumen a la derecha del título, visible aunque esté cerrada. */
  summary?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Sección de la ficha del candidato que se abre y cierra con un toque.
 *
 * La ficha mostraba todo abierto a la vez (historial, 7 escalas de puntaje,
 * documentos) y los botones de Contratar/Descartar quedaban al fondo. Ahora
 * cada bloque muestra solo su resumen hasta que se lo abre.
 *
 * El contenido queda MONTADO aunque esté cerrada (`inert` + alto 0): cerrar
 * "Puntaje" a mitad de calificar no borra lo que se tocó y todavía no se
 * guardó.
 */
export function CollapsibleSection({
  title,
  icon: Icon,
  summary,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <section className={cn('border-t border-slate-100', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-2.5 rounded-lg py-2.5 text-left outline-none transition pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
        <span className="shrink-0 text-xs font-semibold text-slate-800">{title}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[11px] text-slate-500">
          {summary}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* grid 0fr → 1fr: anima el alto real del contenido sin medirlo. */}
      <div
        id={contentId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-3 pt-1">{children}</div>
        </div>
      </div>
    </section>
  )
}
