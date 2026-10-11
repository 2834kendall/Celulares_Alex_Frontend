'use client'

import { Check } from 'lucide-react'
import type { EtapaActual, EtapaSeleccionItem } from '@/modules/recruitment/types'
import { nextStage } from '@/modules/recruitment/lib/stages'
import { cn } from '@/lib/utils/cn'

interface StageStepperProps {
  /** Columnas del tablero (etapas activas), en orden. */
  stages: EtapaSeleccionItem[]
  current: EtapaActual | null
}

/**
 * Barra de pasos del proceso: los mismos pasos, en el mismo orden, que las
 * columnas del tablero. Las anteriores a la actual se marcan hechas; la
 * actual, resaltada con su color; las siguientes, vacías.
 *
 * La etapa actual puede no ser una columna (una etapa que después se
 * eliminó del tablero): igual se nombra abajo, sin marcar ningún paso.
 */
export function StageStepper({ stages, current }: StageStepperProps) {
  const ordered = [...stages].sort((a, b) => a.orden - b.orden)
  const currentColumn = current ? (ordered.find((stage) => stage.id === current.id) ?? null) : null
  const next = nextStage(ordered, currentColumn)

  if (ordered.length === 0 && !current) return null

  return (
    <div className="space-y-2">
      {ordered.length > 0 && (
        <ol className="flex items-center" aria-label="Etapas del proceso">
          {ordered.map((stage, index) => {
            const isCurrent = currentColumn?.id === stage.id
            const done = currentColumn !== null && stage.orden < currentColumn.orden
            return (
              <li
                key={stage.id}
                className={cn('flex items-center', index < ordered.length - 1 && 'flex-1')}
                title={stage.nombre}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors',
                    done && 'border-brand-600 bg-brand-600 text-white',
                    isCurrent &&
                      'border-brand-600 bg-white text-brand-700 ring-4 ring-brand-600/15',
                    !done && !isCurrent && 'border-slate-300 bg-white text-slate-400'
                  )}
                  style={isCurrent && stage.color ? { borderColor: stage.color } : undefined}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                  <span className="sr-only">
                    {stage.nombre}
                    {done ? ' (hecha)' : isCurrent ? ' (actual)' : ''}
                  </span>
                </span>
                {index < ordered.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mx-1 h-0.5 flex-1 rounded-full',
                      done ? 'bg-brand-600' : 'bg-slate-200'
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}

      <p className="text-xs text-slate-600">
        {current ? (
          <>
            Etapa actual: <span className="font-semibold text-slate-900">{current.nombre}</span>
          </>
        ) : (
          <span className="font-semibold text-slate-900">Todavía sin etapa</span>
        )}
        {next && (
          <span className="text-slate-500">
            {' · '}Siguiente: {next.nombre}
          </span>
        )}
      </p>
    </div>
  )
}
