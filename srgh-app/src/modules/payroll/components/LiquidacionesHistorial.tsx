'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { LiquidacionListItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { pagarLiquidacion } from '@/modules/payroll/actions/pagarLiquidacion'
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
  /** Muestra el botón Pagar (NOMINA_WRITE). */
  canWrite?: boolean
}

function AccionLiquidacion({
  item,
  canWrite,
  pagando,
  onPagar,
}: {
  item: LiquidacionListItem
  canWrite: boolean
  pagando: boolean
  onPagar: (item: LiquidacionListItem) => void
}) {
  if (item.pagoId) {
    return (
      <Link
        href={`/comprobante/extraordinario/${item.pagoId}`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900"
      >
        <FileText className="h-3 w-3" /> Comprobante
      </Link>
    )
  }
  if (!canWrite || item.pagado) return null
  return (
    <button
      type="button"
      onClick={() => onPagar(item)}
      disabled={pagando}
      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pagando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Pagar'}
    </button>
  )
}

/**
 * Historial paginado de liquidaciones ya generadas, más recientes primero.
 * Pagar registra el pago con su propio comprobante: no depende de ningún
 * periodo de planilla, porque la persona ya no trabaja.
 */
export function LiquidacionesHistorial({ items, canWrite = false }: LiquidacionesHistorialProps) {
  const router = useRouter()
  const [pagandoId, setPagandoId] = useState<number | null>(null)
  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    items,
    8
  )

  async function handlePagar(item: LiquidacionListItem) {
    const ok = window.confirm(
      `¿Pagar la liquidación de ${item.empleadoNombre} por ${formatCRC(item.neto)} netos? Queda registrada con su comprobante y no se puede deshacer desde acá.`
    )
    if (!ok) return

    setPagandoId(item.liqId)
    const result = await pagarLiquidacion(item.liqId)
    setPagandoId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Liquidación de ${item.empleadoNombre} pagada. El comprobante quedó en la lista.`)
    router.refresh()
  }

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
                  <span className={META_LABEL}>
                    {item.pagado ? 'Neto entregado' : 'Neto a entregar'}
                  </span>
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {formatCRC(item.neto)}
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

                <div className="flex justify-end">
                  <AccionLiquidacion
                    item={item}
                    canWrite={canWrite}
                    pagando={pagandoId === item.liqId}
                    onPagar={handlePagar}
                  />
                </div>
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
                  <th className={TABLE_TH_RIGHT}>Neto</th>
                  <th className={TABLE_TH}>Estado</th>
                  <th className={TABLE_TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item) => (
                  <tr key={item.liqId}>
                    <td className={TABLE_TD_STRONG}>{item.empleadoNombre}</td>
                    <td className={TABLE_TD}>{item.empleadoCedula}</td>
                    <td className={TABLE_TD}>{formatDate(item.fechaSalida)}</td>
                    <td className={TABLE_TD}>{item.motivoNombre}</td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800"
                      title={`Bruto ${formatCRC(item.total)}`}
                    >
                      {formatCRC(item.neto)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={item.pagado ? 'emerald' : 'amber'} size="xs">
                        {item.pagado ? 'Pagada' : 'Pendiente de pago'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AccionLiquidacion
                        item={item}
                        canWrite={canWrite}
                        pagando={pagandoId === item.liqId}
                        onPagar={handlePagar}
                      />
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
