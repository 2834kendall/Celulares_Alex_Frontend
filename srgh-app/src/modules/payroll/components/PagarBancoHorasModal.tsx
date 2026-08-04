'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { BancoHorasItem } from '@/modules/payroll/types'
import { formatCRC } from '@/modules/payroll/lib/format'

interface PagarBancoHorasModalProps {
  item: BancoHorasItem
  submitting: boolean
  onCancel: () => void
  onConfirm: (monto: number) => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10'

/**
 * Confirma el pago de un movimiento pendiente del banco de horas. El monto
 * viene prellenado con la sugerencia (horas × salario por hora × 1.5) pero
 * es editable — el admin puede ajustarlo. Se suma como ingreso al periodo
 * actual en borrador del empleado, con CCSS deducido normalmente.
 */
export function PagarBancoHorasModal({
  item,
  submitting,
  onCancel,
  onConfirm,
}: PagarBancoHorasModalProps) {
  const [monto, setMonto] = useState<string>(String(item.montoSugerido))
  const montoNumero = Number(monto)
  const montoValido = Number.isFinite(montoNumero) && montoNumero > 0

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-4 backdrop-blur-[2px] sm:items-center sm:py-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pagar-banco-horas-title"
    >
      <div className="animate-fade-in w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/5">
        <h3 id="pagar-banco-horas-title" className="text-sm font-bold text-slate-900">
          Pagar horas de {item.empleadoNombre}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {item.horas} horas de {item.periodoOrigenLabel}. El monto se agrega como ingreso al
          periodo actual en borrador de este empleado y se le descuenta CCSS normalmente.
        </p>

        <div className="mt-3">
          <label
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            htmlFor="monto-pago-banco-horas"
          >
            Monto a pagar
          </label>
          <input
            id="monto-pago-banco-horas"
            type="number"
            min="0"
            step="1"
            autoFocus
            disabled={submitting}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={INPUT_CLASSES}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Sugerido (1.5x): {formatCRC(item.montoSugerido)}. Podés ajustarlo.
          </p>
          {!montoValido && monto !== '' && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-600">
              <AlertTriangle className="h-3 w-3" /> El monto debe ser mayor a 0.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={submitting || !montoValido}
            onClick={() => onConfirm(montoNumero)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirmar pago
          </button>
        </div>
      </div>
    </div>
  )
}
