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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  META_LABEL,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
} from '@/components/ui/styles'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

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

const ESTADO_TONE: Record<BancoHorasItem['estado'], BadgeTone> = {
  pendiente: 'amber',
  pagado: 'emerald',
  compensado: 'blue',
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
    <div className="@container space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
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
                ? 'bg-white text-brand-700 shadow-sm'
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
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            Movil: tarjeta por movimiento. Las columnas cambian segun la
            pestaña (historial agrega monto pagado y fecha), asi que la lista
            de campos se arma condicional en vez de duplicar la tarjeta.
          */}
          <ul className="space-y-3 @3xl:hidden">
            {items.map((item, i) => (
              <li
                key={item.id}
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
                  <Badge tone={ESTADO_TONE[item.estado]} size="xs">
                    {ESTADO_LABEL[item.estado]}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                  {[
                    { label: 'Periodo de origen', valor: item.periodoOrigenLabel },
                    { label: 'Horas', valor: String(item.horas) },
                    { label: 'Monto sugerido', valor: formatCRC(item.montoSugerido) },
                    ...(tab === 'historial'
                      ? [
                          {
                            label: 'Monto pagado',
                            valor: item.estado === 'pagado' ? formatCRC(item.montoPagado) : '—',
                          },
                          {
                            label: 'Fecha',
                            valor: formatDate(item.fechaResolucion?.slice(0, 10)),
                          },
                        ]
                      : []),
                  ].map(({ label, valor }) => (
                    <div key={label} className="min-w-0">
                      <dt className={META_LABEL}>{label}</dt>
                      <dd className="mt-0.5 break-words text-xs tabular-nums text-slate-600">
                        {valor}
                      </dd>
                    </div>
                  ))}
                </dl>

                {canWrite && tab === 'pendientes' && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setItemACompensar(item)}
                      disabled={submittingId === item.id}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition hover:border-brand-300 hover:text-brand-700 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      Compensar
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemAPagar(item)}
                      disabled={submittingId === item.id}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {submittingId === item.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Pagar'
                      )}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <table className="hidden w-full text-left text-xs @3xl:table">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className={TABLE_TH}>Empleado</th>
                <th className={TABLE_TH}>Cédula</th>
                <th className={TABLE_TH}>Periodo de origen</th>
                <th className={TABLE_TH}>Horas</th>
                <th className={TABLE_TH}>Monto sugerido</th>
                <th className={TABLE_TH}>Estado</th>
                {tab === 'historial' && (
                  <>
                    <th className={TABLE_TH}>Monto pagado</th>
                    <th className={TABLE_TH}>Fecha</th>
                  </>
                )}
                {canWrite && tab === 'pendientes' && <th className={TABLE_TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={TABLE_TD_STRONG}>{item.empleadoNombre}</td>
                  <td className={TABLE_TD}>{item.empleadoCedula}</td>
                  <td className={TABLE_TD}>{item.periodoOrigenLabel}</td>
                  <td className={TABLE_TD_NUM}>{item.horas}</td>
                  <td className={TABLE_TD_NUM}>{formatCRC(item.montoSugerido)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={ESTADO_TONE[item.estado]} size="xs">
                      {ESTADO_LABEL[item.estado]}
                    </Badge>
                  </td>
                  {tab === 'historial' && (
                    <>
                      <td className={TABLE_TD_NUM}>
                        {item.estado === 'pagado' ? formatCRC(item.montoPagado) : '—'}
                      </td>
                      <td className={TABLE_TD}>{formatDate(item.fechaResolucion?.slice(0, 10))}</td>
                    </>
                  )}
                  {canWrite && tab === 'pendientes' && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setItemACompensar(item)}
                          disabled={submittingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition hover:border-brand-300 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-60"
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
