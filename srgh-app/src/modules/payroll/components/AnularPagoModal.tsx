'use client'

import { useState } from 'react'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { Loader2 } from 'lucide-react'
import { LABEL } from '@/components/ui/styles'
import {
  LARGO_MAXIMO_MOTIVO,
  LARGO_MINIMO_MOTIVO,
} from '@/modules/payroll/lib/anulacionPagosReglas'
import { formatCRC, formatFechaHora } from '@/modules/payroll/lib/format'

interface AnularPagoModalProps {
  /** "el aguinaldo 2026" / "la liquidación". */
  que: string
  empleadoNombre: string
  monto: number
  /** Hasta cuándo se puede anular (ISO). */
  hasta: string
  submitting: boolean
  onCancel: () => void
  onConfirm: (motivo: string) => void
}

/**
 * Anula un pago de aguinaldo o liquidación hecho por error, con un motivo
 * obligatorio (ver anularPagoExtraordinario). El pago no se borra: queda en el
 * historial como anulado, y se puede volver a pagar.
 */
export function AnularPagoModal({
  que,
  empleadoNombre,
  monto,
  hasta,
  submitting,
  onCancel,
  onConfirm,
}: AnularPagoModalProps) {
  const [motivo, setMotivo] = useState('')
  const guard = useUnsavedChanges({
    label: 'la anulación del pago',
    value: motivo,
    busy: submitting,
  })
  const valido = motivo.trim().length >= LARGO_MINIMO_MOTIVO

  return (
    <div
      ref={(element) => guard.bindRoot(element)}
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-4 backdrop-blur-[2px] sm:items-center sm:py-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anular-pago-title"
    >
      <div className="animate-fade-in w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/5">
        <h3 id="anular-pago-title" className="text-sm font-bold text-slate-900">
          ¿Anular el pago de {que} de {empleadoNombre}?
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Se anula el pago de {formatCRC(monto)}: vuelve a quedar sin pagar y su comprobante deja de
          valer. No se borra: queda en el historial con tu nombre y el motivo. Después se puede
          volver a pagar, con un comprobante nuevo. Se puede anular hasta el{' '}
          {formatFechaHora(hasta)}.
        </p>
        <p className="mt-2 text-xs leading-5 text-amber-800">
          Si la plata ya salió de la cuenta, anular no la devuelve: coordiná la devolución con el
          empleado por aparte.
        </p>

        <div className="mt-3">
          <label className={LABEL} htmlFor="motivo-anular-pago">
            Motivo (obligatorio)
          </label>
          <textarea
            id="motivo-anular-pago"
            rows={3}
            maxLength={LARGO_MAXIMO_MOTIVO}
            autoFocus
            disabled={submitting}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: se pagó a la persona equivocada."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Al menos {LARGO_MINIMO_MOTIVO} caracteres.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => guard.confirmLeave(onCancel)}
            disabled={submitting}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={submitting || !valido}
            onClick={() => onConfirm(motivo.trim())}
            className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            Sí, anular el pago
          </button>
        </div>
      </div>
    </div>
  )
}
