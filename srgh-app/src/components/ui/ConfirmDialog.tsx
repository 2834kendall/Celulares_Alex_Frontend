'use client'

import { useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Confirmacion de acciones destructivas, consistente con `Modal`.
 *
 * Antes existia copiado en `evaluations/` y `payroll/`. Solo la copia de
 * evaluations bloqueaba el scroll del fondo, asi que el mismo dialogo se
 * comportaba distinto segun desde donde se abriera; al unificar, el bloqueo
 * aplica siempre.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Eliminar',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useBodyScrollLock()
  const titleId = useId()
  const messageId = useId()

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-4 backdrop-blur-[2px] sm:items-center sm:py-5"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <div className="animate-fade-in w-full max-w-[19rem] rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-bold text-slate-900">
              {title}
            </h3>
            <p id={messageId} className="mt-1 text-xs leading-5 text-slate-500">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          {/* autoFocus deja el foco en la opcion no destructiva al abrir. */}
          <Button variant="secondary" size="md" onClick={onCancel} autoFocus>
            Cancelar
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
