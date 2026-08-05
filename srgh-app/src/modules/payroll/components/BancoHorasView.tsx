'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BancoHorasItem } from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { pagarBancoHoras } from '@/modules/payroll/actions/pagarBancoHoras'
import { compensarBancoHoras } from '@/modules/payroll/actions/compensarBancoHoras'
import { PagarBancoHorasModal } from './PagarBancoHorasModal'
import { ConfirmDialog } from './ConfirmDialog'

interface BancoHorasViewProps {
  pendientes: BancoHorasItem[]
  historial: BancoHorasItem[]
  canWrite: boolean
}

const TABS = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'historial', label: 'Historial' },
] as const

type TabId = (typeof TABS)[number]['id']

const ESTADO_BADGE: Record<BancoHorasItem['estado'], string> = {
  pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
  pagado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  compensado: 'bg-blue-50 text-blue-700 ring-blue-200',
}

const ESTADO_LABEL: Record<BancoHorasItem['estado'], string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  compensado: 'Compensado',
}

export function BancoHorasView({ pendientes, historial, canWrite }: BancoHorasViewProps) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('pendientes')
  const [itemAPagar, setItemAPagar] = useState<BancoHorasItem | null>(null)
  const [itemACompensar, setItemACompensar] = useState<BancoHorasItem | null>(null)
  const [submittingId, setSubmittingId] = useState<number | null>(null)

  async function handleConfirmarPago(monto: number) {
    if (!itemAPagar) return
    setSubmittingId(itemAPagar.id)
    const result = await pagarBancoHoras({ bhmId: itemAPagar.id, monto })
    setSubmittingId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(
      `Pago agregado al periodo ${result.periodoLabel} de ${itemAPagar.empleadoNombre}.`
    )
    setItemAPagar(null)
    router.refresh()
  }

  async function handleConfirmarCompensacion() {
    if (!itemACompensar) return
    setSubmittingId(itemACompensar.id)
    const result = await compensarBancoHoras(itemACompensar.id)
    setSubmittingId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(`Horas de ${itemACompensar.empleadoNombre} marcadas como compensadas.`)
    setItemACompensar(null)
    router.refresh()
  }

  const items = tab === 'pendientes' ? pendientes : historial

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Cuando un empleado trabaja más de las horas normales de la quincena, esas horas de más
          quedan pendientes acá (ya no se pagan solas en la misma planilla). Podés pagarlas —se
          agregan al periodo actual en borrador del empleado, con CCSS incluido— o compensarlas como
          registro.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 transition ${
              tab === t.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label} ({t.id === 'pendientes' ? pendientes.length : historial.length})
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          {tab === 'pendientes'
            ? 'No hay horas pendientes por resolver.'
            : 'Todavía no hay movimientos pagados ni compensados.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Empleado</th>
                <th className="px-4 py-2.5">Cédula</th>
                <th className="px-4 py-2.5">Periodo de origen</th>
                <th className="px-4 py-2.5">Horas</th>
                <th className="px-4 py-2.5">Monto sugerido</th>
                <th className="px-4 py-2.5">Estado</th>
                {tab === 'historial' && (
                  <>
                    <th className="px-4 py-2.5">Monto pagado</th>
                    <th className="px-4 py-2.5">Fecha</th>
                  </>
                )}
                {canWrite && tab === 'pendientes' && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{item.empleadoNombre}</td>
                  <td className="px-4 py-2.5 text-slate-500">{item.empleadoCedula}</td>
                  <td className="px-4 py-2.5 text-slate-500">{item.periodoOrigenLabel}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-800">{item.horas}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-800">
                    {formatCRC(item.montoSugerido)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${ESTADO_BADGE[item.estado]}`}
                    >
                      {ESTADO_LABEL[item.estado]}
                    </span>
                  </td>
                  {tab === 'historial' && (
                    <>
                      <td className="px-4 py-2.5 tabular-nums text-slate-800">
                        {item.estado === 'pagado' ? formatCRC(item.montoPagado) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {formatDate(item.fechaResolucion?.slice(0, 10))}
                      </td>
                    </>
                  )}
                  {canWrite && tab === 'pendientes' && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setItemACompensar(item)}
                          disabled={submittingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition hover:border-blue-300 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                          Compensar
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemAPagar(item)}
                          disabled={submittingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                          {submittingId === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Pagar'
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {itemAPagar && (
        <PagarBancoHorasModal
          item={itemAPagar}
          submitting={submittingId === itemAPagar.id}
          onCancel={() => setItemAPagar(null)}
          onConfirm={handleConfirmarPago}
        />
      )}

      {itemACompensar && (
        <ConfirmDialog
          title={`Compensar horas de ${itemACompensar.empleadoNombre}`}
          message={`Se registran ${itemACompensar.horas} horas como compensadas (tiempo libre dado, sin pago). No afecta ningún cálculo de planilla — es solo un registro.`}
          confirmLabel="Compensar"
          onCancel={() => setItemACompensar(null)}
          onConfirm={handleConfirmarCompensacion}
        />
      )}
    </div>
  )
}
