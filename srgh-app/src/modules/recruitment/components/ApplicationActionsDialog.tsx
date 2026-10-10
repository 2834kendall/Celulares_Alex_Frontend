'use client'

import Link from 'next/link'
import { Check, CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS, Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils/cn'

interface ApplicationActionsDialogProps {
  application: PostulacionBoardItem
  stages: EtapaSeleccionItem[]
  onMove: (stage: EtapaSeleccionItem) => void
  onDiscard: () => void
  onClose: () => void
}

/**
 * Acciones de una tarjeta sin arrastrar: mover a otra columna, abrir la
 * ficha, contratar o descartar.
 *
 * Es la alternativa al arrastre para el celular (arrastrar con el dedo entre
 * columnas que no entran en pantalla es incómodo) y para el teclado. Va en
 * una ventana y no en un menú desplegable porque las columnas scrollean: un
 * menú colgado de la tarjeta quedaba recortado.
 */
export function ApplicationActionsDialog({
  application,
  stages,
  onMove,
  onDiscard,
  onClose,
}: ApplicationActionsDialogProps) {
  const hireHref = `/recruitment/candidates/${application.candidatoId}/hire?postulacionId=${application.posId}`

  return (
    <Modal
      title={application.candidatoNombre}
      subtitle={[application.puestoNombre, application.sucursalNombre].filter(Boolean).join(' · ')}
      onClose={onClose}
    >
      <div className="space-y-4">
        {stages.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">Mover a</p>
            <ul className="space-y-1">
              {stages.map((stage) => {
                const current = stage.id === application.etapaId
                return (
                  <li key={stage.id}>
                    <button
                      type="button"
                      disabled={current}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => onMove(stage)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium outline-none transition pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-brand-500/60',
                        current
                          ? 'cursor-default border-brand-200 bg-brand-50 text-brand-800'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] motion-reduce:active:scale-100'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: stage.color ?? '#cbd5e1' }}
                      />
                      <span className="min-w-0 flex-1 truncate">{stage.nombre}</span>
                      {current && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Está acá
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
          <Link
            href={`/recruitment/candidates/${application.candidatoId}`}
            className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.md)}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir ficha
          </Link>
          <Link
            href={hireHref}
            className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.md)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> Contratar
          </Link>
          <Button variant="secondary" size="md" onClick={onDiscard}>
            <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" /> Descartar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
