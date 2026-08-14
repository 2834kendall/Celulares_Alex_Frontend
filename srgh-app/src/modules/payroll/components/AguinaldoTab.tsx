'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AguinaldoItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { pagarAguinaldo } from '@/modules/payroll/actions/pagarAguinaldo'
import {
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_WRAP,
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
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
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
        <div className={TABLE_WRAP}>
          <table className="w-full text-left text-xs">
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
