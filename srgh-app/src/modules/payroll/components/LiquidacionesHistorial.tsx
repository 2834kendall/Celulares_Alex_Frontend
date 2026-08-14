'use client'

import type { LiquidacionListItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import {
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
  TABLE_WRAP,
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
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Historial de liquidaciones
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          Todavía no se ha generado ninguna liquidación.
        </p>
      ) : (
        <div className={TABLE_WRAP}>
          <div className="overflow-x-auto">
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
