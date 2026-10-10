'use client'

import { useEffect, useRef } from 'react'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'
import { cn } from '@/lib/utils/cn'

interface BoardColumnNavProps {
  stages: EtapaSeleccionItem[]
  /** Candidatos por columna (id de etapa → cantidad). */
  counts: ReadonlyMap<number, number>
  /** Columnas que se están viendo ahora en el tablero. */
  visible: ReadonlySet<number>
  onGo: (stageId: number) => void
}

/**
 * Índice del tablero: una pastilla por columna, con su conteo. Tocar una
 * lleva el tablero hasta esa columna (y la expande si estaba contraída).
 *
 * Existe para cuando las columnas no entran en pantalla — siempre en el
 * celular, donde se ve una sola a la vez, y en escritorio a partir de la
 * cuarta. Las que están a la vista quedan resaltadas, así que también dice
 * "dónde estoy" mientras se desliza el tablero.
 */
export function BoardColumnNav({ stages, counts, visible, onGo }: BoardColumnNavProps) {
  const navRef = useRef<HTMLElement>(null)
  const firstVisibleId = stages.find((stage) => visible.has(stage.id))?.id ?? null

  // Al deslizar el tablero, la pastilla de la columna actual se mantiene a
  // la vista. Se mueve solo la tira (scrollTo), nunca la página.
  useEffect(() => {
    const nav = navRef.current
    if (!nav || firstVisibleId === null) return
    const chip = nav.querySelector<HTMLElement>(`[data-nav-stage="${firstVisibleId}"]`)
    if (!chip) return
    const navBox = nav.getBoundingClientRect()
    const chipBox = chip.getBoundingClientRect()
    if (chipBox.left >= navBox.left && chipBox.right <= navBox.right) return
    nav.scrollTo({
      left: nav.scrollLeft + (chipBox.left - navBox.left) - (navBox.width - chipBox.width) / 2,
    })
  }, [firstVisibleId])

  return (
    <nav
      ref={navRef}
      aria-label="Ir a una columna"
      className={cn(
        '-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Con pocas columnas en escritorio ya se ven todas: el índice sobra.
        stages.length <= 3 && 'lg:hidden'
      )}
    >
      {stages.map((stage) => {
        const inView = visible.has(stage.id)
        const count = counts.get(stage.id) ?? 0
        return (
          <button
            key={stage.id}
            type="button"
            data-nav-stage={stage.id}
            onClick={() => onGo(stage.id)}
            aria-current={inView ? 'true' : undefined}
            aria-label={`Ir a ${stage.nombre}: ${count} ${count === 1 ? 'candidato' : 'candidatos'}`}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-95 motion-reduce:active:scale-100 pointer-coarse:min-h-11 pointer-coarse:px-3',
              inView
                ? 'border-brand-300 bg-brand-50 text-brand-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
            )}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: stage.color ?? '#cbd5e1' }}
            />
            <span className="max-w-32 truncate">{stage.nombre}</span>
            <span
              key={count}
              className={cn(
                'animate-board-count-pop tabular-nums',
                count === 0 ? 'text-slate-400' : 'text-slate-900'
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
