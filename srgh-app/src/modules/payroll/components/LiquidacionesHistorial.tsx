'use client'

import type { LiquidacionListItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import {
  META_LABEL,
  TABLE_DESKTOP_WRAP,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from '@/components/ui/styles'
import { Badge } from '@/components/ui/Badge'

interface LiquidacionesHistorialProps {
  items: LiquidacionListItem[]
}

/** Historial paginado de liquidaciones ya generadas, más recientes primero. */
export function LiquidacionesHistorial({ items }: LiquidacionesHistorialProps) {
  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    items,
    8
  )

  return (
    <div className="@container">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Historial de liquidaciones
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          Todavía no se ha generado ninguna liquidación.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/* Movil: tarjeta por liquidacion. El total va destacado. */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedItems.map((item, i) => (
              <li
                key={item.liqId}
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
                    {item.pagado ? 'Pagada' : 'Pendiente de pago'}
                  </Badge>
                </div>

                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span className={META_LABEL}>Total</span>
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {formatCRC(item.total)}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {[
                    { label: 'Fecha de salida', valor: formatDate(item.fechaSalida) },
                    { label: 'Motivo', valor: item.motivoNombre },
                  ].map(({ label, valor }) => (
                    <div key={label} className="min-w-0">
                      <dt className={META_LABEL}>{label}</dt>
                      <dd className="mt-0.5 break-words text-xs text-slate-600">{valor}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          <div className={TABLE_DESKTOP_WRAP}>
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Empleado</th>
                  <th className={TABLE_TH}>Cédula</th>
                  <th className={TABLE_TH}>Fecha de salida</th>
                  <th className={TABLE_TH}>Motivo</th>
                  <th className={TABLE_TH_RIGHT}>Total</th>
                  <th className={TABLE_TH}>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item) => (
                  <tr key={item.liqId}>
                    <td className={TABLE_TD_STRONG}>{item.empleadoNombre}</td>
                    <td className={TABLE_TD}>{item.empleadoCedula}</td>
                    <td className={TABLE_TD}>{formatDate(item.fechaSalida)}</td>
                    <td className={TABLE_TD}>{item.motivoNombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                      {formatCRC(item.total)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={item.pagado ? 'emerald' : 'amber'} size="xs">
                        {item.pagado ? 'Pagada' : 'Pendiente de pago'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </div>
      )}
    </div>
  )
}
