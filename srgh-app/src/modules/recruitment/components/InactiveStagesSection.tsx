'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Archive, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { purgeSelectionStage } from '@/modules/recruitment/actions/purgeSelectionStage'
import { restoreSelectionStage } from '@/modules/recruitment/actions/restoreSelectionStage'
import type { InactiveStageItem } from '@/modules/recruitment/types'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { SPINNER } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { CollapsibleSection } from './CollapsibleSection'

interface InactiveStagesSectionProps {
  stages: InactiveStageItem[]
  /** Se restauró una etapa: quien lista las columnas puede resaltarla. */
  onRestored?: (stageId: number) => void
}

/**
 * Etapas desactivadas: están en el catálogo pero no son columnas del tablero.
 *
 * Quedan así cuando se "elimina" una columna por la que ya pasó algún
 * candidato (su historial la referencia y no se puede borrar), o porque
 * venían apagadas del catálogo original. Sin esta lista eran invisibles — y
 * aun así ocupaban su nombre, que es único: crear una columna con el mismo
 * nombre fallaba sin que se viera con qué chocaba.
 *
 * Cada una se puede restaurar (vuelve al tablero como última columna) o,
 * si nadie pasó por ella, eliminar del todo. Arranca cerrada: es limpieza,
 * no trabajo de todos los días.
 */
export function InactiveStagesSection({ stages, onRestored }: InactiveStagesSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [purging, setPurging] = useState<InactiveStageItem | null>(null)

  if (stages.length === 0) return null

  function restore(stage: InactiveStageItem) {
    setBusyId(stage.id)
    startTransition(async () => {
      const result = await restoreSelectionStage(stage.id)
      setBusyId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`"${stage.nombre}" volvió al tablero, como última columna.`)
      onRestored?.(stage.id)
    })
  }

  function purge(stage: InactiveStageItem) {
    setPurging(null)
    setBusyId(stage.id)
    startTransition(async () => {
      const result = await purgeSelectionStage(stage.id)
      setBusyId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Etapa eliminada.')
    })
  }

  return (
    <CollapsibleSection
      title="Etapas desactivadas"
      icon={Archive}
      summary={
        <span className="rounded-full bg-slate-100 px-1.5 py-px text-[11px] font-semibold tabular-nums text-slate-600">
          {stages.length}
        </span>
      }
      className="border-t-0"
    >
      <p className="pb-2 text-[11px] leading-relaxed text-slate-500">
        No aparecen en el tablero, pero siguen ocupando su nombre. Restaurá las que quieras volver a
        usar; las que no tengan historial se pueden eliminar del todo.
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {stages.map((stage) => {
          const busy = busyId === stage.id
          return (
            <li
              key={stage.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 transition-opacity sm:px-3',
                busy && 'opacity-60'
              )}
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full border border-black/10 opacity-70"
                style={{ backgroundColor: stage.color ?? '#cbd5e1' }}
              />
              <div className="min-w-0 flex-1 py-1">
                <p className="text-xs font-semibold break-words text-slate-700">{stage.nombre}</p>
                <p className="text-[11px] text-slate-500">
                  {stage.cardCount === 0
                    ? 'Sin candidatos en proceso'
                    : `${stage.cardCount} ${stage.cardCount === 1 ? 'candidato sigue' : 'candidatos siguen'} acá: en el tablero ${stage.cardCount === 1 ? 'aparece' : 'aparecen'} en "Sin etapa"`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="secondary"
                  onClick={() => restore(stage)}
                  disabled={isPending}
                  aria-label={`Restaurar ${stage.nombre}`}
                  className="group"
                >
                  {busy ? (
                    <Loader2 className={SPINNER} />
                  ) : (
                    <RotateCcw
                      className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  )}
                  Restaurar
                </Button>
                <IconButton
                  tone="rose"
                  onClick={() => setPurging(stage)}
                  disabled={isPending}
                  aria-label={`Eliminar del todo ${stage.nombre}`}
                  title="Eliminar del todo"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          )
        })}
      </ul>

      {purging && (
        <ConfirmDialog
          title="Eliminar etapa del todo"
          message={`"${purging.nombre}" se borra del catálogo y no se puede recuperar. Solo es posible si ningún candidato pasó por ella.`}
          onCancel={() => setPurging(null)}
          onConfirm={() => purge(purging)}
        />
      )}
    </CollapsibleSection>
  )
}
