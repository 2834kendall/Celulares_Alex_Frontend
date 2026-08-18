'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AguinaldoItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { pagarAguinaldo } from '@/modules/payroll/actions/pagarAguinaldo'
import {
  META_LABEL,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
} from '@/components/ui/styles'
import { Badge } from '@/components/ui/Badge'

interface AguinaldoTabProps {
  anio: number
  items: AguinaldoItem[]
  canWrite: boolean
}

/**
 * Lista el aguinaldo acumulado del ciclo actual (diciembre-noviembre) por
 * empleado activo. El monto se arma solo, período a período, cada vez que
 * se marca un pago de nómina como pagado — acá solo se confirma el
 * desembolso una vez al año.
 */
export function AguinaldoTab({ anio, items, canWrite }: AguinaldoTabProps) {
  const router = useRouter()
  const [pagandoId, setPagandoId] = useState<number | null>(null)

  async function handlePagar(item: AguinaldoItem) {
    setPagandoId(item.historialLaboralId)
    const result = await pagarAguinaldo(item.historialLaboralId, item.anio)
    setPagandoId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(`Aguinaldo de ${item.empleadoNombre} marcado como pagado.`)
    router.refresh()
  }

  return (
    <div className="@container space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
        <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Ciclo {anio - 1} - {anio} (diciembre a noviembre). El monto se calcula solo: salario bruto
          de cada quincena pagada ÷ 12. Si un empleado no tiene pagos marcados como pagados todavía
          en este ciclo, aparece en ₡0.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          No hay empleados activos.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/* Movil: tarjeta por empleado, con el acumulado destacado. */}
          <ul className="space-y-3 @3xl:hidden">
            {items.map((item, i) => (
              <li
                key={item.historialLaboralId}
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                className="animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-800">
                      {item.empleadoNombre}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                      {item.empleadoCedula}
                    </p>
                  </div>
                  <Badge tone={item.pagado ? 'emerald' : 'amber'} size="xs">
                    {item.pagado ? 'Pagado' : 'Pendiente'}
                  </Badge>
                </div>

                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span className={META_LABEL}>Acumulado</span>
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {formatCRC(item.montoAcumulado)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">
                    Fecha de pago:{' '}
                    <span className="tabular-nums">{formatDate(item.fechaPago)}</span>
                  </p>
                  {canWrite && !item.pagado && item.montoAcumulado > 0 && (
                    <button
                      type="button"
                      onClick={() => handlePagar(item)}
                      disabled={pagandoId === item.historialLaboralId}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {pagandoId === item.historialLaboralId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Marcar pagado'
                      )}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <table className="hidden w-full text-left text-xs @3xl:table">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className={TABLE_TH}>Empleado</th>
                <th className={TABLE_TH}>Cédula</th>
                <th className={TABLE_TH}>Acumulado</th>
                <th className={TABLE_TH}>Estado</th>
                <th className={TABLE_TH}>Fecha de pago</th>
                {canWrite && <th className={TABLE_TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.historialLaboralId}>
                  <td className={TABLE_TD_STRONG}>{item.empleadoNombre}</td>
                  <td className={TABLE_TD}>{item.empleadoCedula}</td>
                  <td className={TABLE_TD_NUM}>{formatCRC(item.montoAcumulado)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={item.pagado ? 'emerald' : 'amber'} size="xs">
                      {item.pagado ? 'Pagado' : 'Pendiente'}
                    </Badge>
                  </td>
                  <td className={TABLE_TD}>{formatDate(item.fechaPago)}</td>
                  {canWrite && (
                    <td className="px-3 py-2 text-right">
                      {!item.pagado && item.montoAcumulado > 0 && (
                        <button
                          type="button"
                          onClick={() => handlePagar(item)}
                          disabled={pagandoId === item.historialLaboralId}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                          {pagandoId === item.historialLaboralId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Marcar pagado'
                          )}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
