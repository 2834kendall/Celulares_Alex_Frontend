'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { BancoHorasItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { LABEL } from '@/components/ui/styles'

interface CompensarHorasLiquidadoModalProps {
  item: BancoHorasItem & { liquidadoSinIncluir: { liqId: number; fechaSalida: string } }
  submitting: boolean
  onCancel: () => void
  onConfirm: (nota: string) => void
}

const LARGO_MINIMO = 5

/**
 * Cierra horas del banco que una liquidación vieja dejó fuera. No hay
 * quincena donde pagarlas, así que se registran como compensadas, con una
 * nota obligatoria que diga qué se hizo con ellas (ver compensarBancoHoras).
 */
export function CompensarHorasLiquidadoModal({
  item,
  submitting,
  onCancel,
  onConfirm,
}: CompensarHorasLiquidadoModalProps) {
  const [nota, setNota] = useState('')
  const valida = nota.trim().length >= LARGO_MINIMO

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-4 backdrop-blur-[2px] sm:items-center sm:py-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compensar-liquidado-title"
    >
      <div className="animate-fade-in w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/5">
        <h3 id="compensar-liquidado-title" className="text-sm font-bold text-slate-900">
          Cerrar horas de {item.empleadoNombre}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {item.horas} h de {item.periodoOrigenLabel} (sugerido {formatCRC(item.montoSugerido)})
          quedaron fuera de la liquidación n.° {item.liquidadoSinIncluir.liqId} (salida del{' '}
          {formatDate(item.liquidadoSinIncluir.fechaSalida)}). Ya no se pueden pagar por planilla:
          se registran como compensadas y no cambian ningún monto.
        </p>

        <div className="mt-3">
          <label className={LABEL} htmlFor="nota-compensar-liquidado">
            Nota (obligatoria)
          </label>
          <textarea
            id="nota-compensar-liquidado"
            rows={3}
            maxLength={500}
            autoFocus
            disabled={submitting}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: se le pagaron por transferencia el 10/10/2026."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Queda guardada con el movimiento, en el historial del banco de horas.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={submitting || !valida}
            onClick={() => onConfirm(nota.trim())}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            Registrar como compensadas
          </button>
        </div>
      </div>
    </div>
  )
}
