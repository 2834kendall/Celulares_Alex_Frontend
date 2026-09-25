'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Gift, Loader2 } from 'lucide-react'
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
import { Badge, type BadgeTone } from '@/components/ui/Badge'

interface AguinaldoTabProps {
  anio: number
  /** Año del ciclo en curso: la pestaña deja ver ese y el anterior. */
  anioActual: number
  items: AguinaldoItem[]
  canWrite: boolean
  /** El ciclo ya cerró (hoy es 1 de diciembre de `anio` o después). */
  cicloCerrado: boolean
  /** Sin permiso de ausencias el monto no ve la maternidad: no se deja pagar. */
  puedeLeerAusencias: boolean
}

type Estado = { label: string; tone: BadgeTone }

function estadoDe(item: AguinaldoItem, cicloCerrado: boolean): Estado {
  if (item.pagado) return { label: 'Pagado', tone: 'emerald' }
  if (!item.elegible) return { label: 'No le corresponde', tone: 'slate' }
  if (!cicloCerrado) return { label: 'En curso', tone: 'blue' }
  return { label: 'Pendiente', tone: 'amber' }
}

/** Notas de la fila: de dónde sale el monto y qué falta para pagarlo. */
function notasDe(item: AguinaldoItem): string[] {
  const notas: string[] = []
  if (!item.elegible) {
    notas.push('Al 30 de noviembre no tenía un mes laborado continuo (mínimo de ley).')
  }
  if (item.maternidad > 0) {
    notas.push(`Incluye ${formatCRC(item.maternidad)} de licencia de maternidad.`)
  }
  if (item.fechaSalida) {
    notas.push(`Salió el ${formatDate(item.fechaSalida)}, después del cierre: se le debe completo.`)
  }
  if (!item.pagado && item.quincenasSinPagar.length > 0) {
    notas.push(`Sin pagar (no entran): ${item.quincenasSinPagar.join(', ')}.`)
  }
  return notas
}

function AccionAguinaldo({
  item,
  habilitado,
  pagando,
  compacto,
  onPagar,
}: {
  item: AguinaldoItem
  habilitado: boolean
  pagando: boolean
  compacto: boolean
  onPagar: (item: AguinaldoItem) => void
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
  if (!habilitado) return null
  return (
    <button
      type="button"
      onClick={() => onPagar(item)}
      disabled={pagando}
      className={`inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-[11px] font-semibold text-white shadow-sm outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60 ${
        compacto ? 'px-2.5 py-1' : 'min-h-11 px-3'
      }`}
    >
      {pagando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Pagar'}
    </button>
  )
}

/**
 * Aguinaldo del ciclo (1 de diciembre al 30 de noviembre) de cada persona a
 * la que se le debe. El monto se calcula de las quincenas pagadas; el botón
 * Pagar registra el pago con su propio comprobante, sin tocar la planilla.
 */
export function AguinaldoTab({
  anio,
  anioActual,
  items,
  canWrite,
  cicloCerrado,
  puedeLeerAusencias,
}: AguinaldoTabProps) {
  const router = useRouter()
  const [pagandoId, setPagandoId] = useState<number | null>(null)

  function puedePagar(item: AguinaldoItem): boolean {
    return (
      canWrite &&
      puedeLeerAusencias &&
      cicloCerrado &&
      !item.pagado &&
      item.elegible &&
      item.monto > 0 &&
      item.quincenasSinPagar.length === 0
    )
  }

  async function handlePagar(item: AguinaldoItem) {
    const ok = window.confirm(
      `¿Pagar el aguinaldo de ${item.empleadoNombre} por ${formatCRC(item.monto)}? Queda registrado con su comprobante y no se puede deshacer desde acá.`
    )
    if (!ok) return

    setPagandoId(item.historialLaboralId)
    const result = await pagarAguinaldo(item.historialLaboralId, item.anio)
    setPagandoId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(`Aguinaldo de ${item.empleadoNombre} pagado. El comprobante quedó en la lista.`)
    router.refresh()
  }

  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap gap-1 text-[11px] font-semibold">
        {[anioActual, anioActual - 1].map((a) => (
          <Link
            key={a}
            href={
              a === anioActual
                ? '/payroll/aguinaldo-liquidacion'
                : `/payroll/aguinaldo-liquidacion?anio=${a}`
            }
            className={`rounded-lg px-2.5 py-1 transition ${
              a === anio
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Ciclo {a - 1}-{a}
          </Link>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
        <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Ciclo {anio - 1}-{anio}: del 1 de diciembre de {anio - 1} al 30 de noviembre de {anio}, se
          paga desde el 1 de diciembre de {anio} (a más tardar el 20). Monto: salario de cada
          quincena pagada ÷ 12. La licencia de maternidad cuenta como salario; las incapacidades no
          (son subsidio). Hace falta un mes laborado continuo al 30 de noviembre. El pago queda con
          su propio comprobante y no toca la planilla.
        </p>
      </div>

      {!puedeLeerAusencias && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Tu usuario no puede leer Ausencias: los montos no incluyen licencias de maternidad y no se
          puede pagar. Pedile a un administrador el permiso AUSENCIAS_READ.
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          No hay empleados con aguinaldo en este ciclo.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/* Movil: tarjeta por empleado, con el monto destacado. */}
          <ul className="space-y-3 @3xl:hidden">
            {items.map((item, i) => {
              const estado = estadoDe(item, cicloCerrado)
              const notas = notasDe(item)
              return (
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
                    <Badge tone={estado.tone} size="xs">
                      {estado.label}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span className={META_LABEL}>{item.pagado ? 'Pagado' : 'Aguinaldo'}</span>
                    <span className="text-base font-bold tabular-nums text-slate-900">
                      {formatCRC(item.monto)}
                    </span>
                  </div>

                  {notas.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-slate-500">
                      {notas.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">
                      Fecha de pago:{' '}
                      <span className="tabular-nums">{formatDate(item.fechaPago)}</span>
                    </p>
                    <AccionAguinaldo
                      item={item}
                      habilitado={puedePagar(item)}
                      pagando={pagandoId === item.historialLaboralId}
                      compacto={false}
                      onPagar={handlePagar}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          <table className="hidden w-full text-left text-xs @3xl:table">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className={TABLE_TH}>Empleado</th>
                <th className={TABLE_TH}>Cédula</th>
                <th className={TABLE_TH}>Aguinaldo</th>
                <th className={TABLE_TH}>Estado</th>
                <th className={TABLE_TH}>Fecha de pago</th>
                <th className={TABLE_TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const estado = estadoDe(item, cicloCerrado)
                const notas = notasDe(item)
                return (
                  <tr key={item.historialLaboralId}>
                    <td className={TABLE_TD_STRONG}>
                      {item.empleadoNombre}
                      {notas.length > 0 && (
                        <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                          {notas.join(' ')}
                        </span>
                      )}
                    </td>
                    <td className={TABLE_TD}>{item.empleadoCedula}</td>
                    <td className={TABLE_TD_NUM}>{formatCRC(item.monto)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={estado.tone} size="xs">
                        {estado.label}
                      </Badge>
                    </td>
                    <td className={TABLE_TD}>{formatDate(item.fechaPago)}</td>
                    <td className="px-3 py-2 text-right">
                      <AccionAguinaldo
                        item={item}
                        habilitado={puedePagar(item)}
                        pagando={pagandoId === item.historialLaboralId}
                        compacto
                        onPagar={handlePagar}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
