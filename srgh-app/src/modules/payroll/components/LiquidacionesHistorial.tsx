'use client'

import type { LiquidacionListItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'

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
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Historial de liquidaciones
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          Todavía no se ha generado ninguna liquidación.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Empleado</th>
                  <th className="px-4 py-2.5">Cédula</th>
                  <th className="px-4 py-2.5">Fecha de salida</th>
                  <th className="px-4 py-2.5">Motivo</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item) => (
                  <tr key={item.liqId}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {item.empleadoNombre}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{item.empleadoCedula}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDate(item.fechaSalida)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.motivoNombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                      {formatCRC(item.total)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                          item.pagado
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200'
                        }`}
                      >
                        {item.pagado ? 'Pagada' : 'Pendiente de pago'}
                      </span>
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
