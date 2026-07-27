'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Banknote,
  CalendarDays,
  Loader2,
  Pencil,
  Receipt,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ConceptoNominaRow, DetalleNominaItem, PeriodoDetalle } from '@/modules/payroll/types'
import {
  estadoBadgeClasses,
  estadoLabel,
  formatCRC,
  formatDate,
  formatIban,
  periodoLabel,
} from '@/modules/payroll/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { marcarDetallePagado } from '@/modules/payroll/actions/marcarDetallePagado'
import { DetalleEditForm } from './DetalleEditForm'
import { RegistrarIncapacidadForm } from './RegistrarIncapacidadForm'

interface PeriodoDetailProps {
  periodo: PeriodoDetalle
  canWrite: boolean
  conceptosManuales: ConceptoNominaRow[]
}

/**
 * Cabecera del periodo + tabla de planilla. La edición manual de ingresos
 * (BASE, FERIADO, COMISION, HORAS_EXTRA, AJUSTE) solo se ofrece mientras el
 * periodo está en borrador — igual que la subida de Excel.
 */
export function PeriodoDetail({ periodo, canWrite, conceptosManuales }: PeriodoDetailProps) {
  const router = useRouter()
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [registrandoIncapacidadId, setRegistrandoIncapacidadId] = useState<number | null>(null)
  const [pagandoId, setPagandoId] = useState<number | null>(null)

  const puedeEditar = canWrite && periodo.estado === 'borrador'

  // Marcar/desmarcar un pago individual no depende del estado del periodo
  // (ndt_pagado es independiente de npe_estado) — solo requiere permiso de
  // escritura sobre nómina.
  async function handleTogglePagado(detalle: DetalleNominaItem) {
    setPagandoId(detalle.id)
    const result = await marcarDetallePagado(detalle.id, !detalle.pagado)
    setPagandoId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(
      detalle.pagado
        ? 'Pago desmarcado.'
        : 'Pago marcado como realizado. Ya puedes ver el comprobante.'
    )
    router.refresh()
  }

  // Los totales se calculan sobre todos los detalles del periodo, no solo
  // sobre la página visible — son un resumen del periodo completo.
  const totalBruto = periodo.detalles.reduce((sum, d) => sum + d.salarioBruto, 0)
  const totalDeduccionPorcentual = periodo.detalles.reduce(
    (sum, d) => sum + d.deduccionPorcentual,
    0
  )
  const totalDeduccionManual = periodo.detalles.reduce((sum, d) => sum + d.deduccionManual, 0)
  const totalNeto = periodo.detalles.reduce((sum, d) => sum + d.salarioNeto, 0)
  const totalIncapacidad = periodo.detalles.reduce((sum, d) => sum + (d.incapacidad?.monto ?? 0), 0)

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    periodo.detalles,
    8
  )

  const resumen = [
    {
      key: 'empleados',
      icon: Users,
      label: 'Empleados en planilla',
      value: String(periodo.detalles.length),
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'bruto',
      icon: Banknote,
      label: 'Salario bruto total',
      value: formatCRC(totalBruto),
      tone: 'bg-slate-100 text-slate-600',
    },
    {
      key: 'neto',
      icon: CalendarDays,
      label: 'Neto a pagar',
      value: formatCRC(totalNeto),
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
              {periodoLabel(periodo.mes, periodo.anio, periodo.quincena)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {periodo.sucursalNombre} · {formatDate(periodo.fechaInicio)} —{' '}
              {formatDate(periodo.fechaFin)}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${estadoBadgeClasses(periodo.estado)}`}
          >
            {estadoLabel(periodo.estado)}
          </span>
        </div>

        {periodo.fechaPago && (
          <p className="mt-3 text-xs text-slate-500">
            Fecha de pago: <span className="font-semibold">{formatDate(periodo.fechaPago)}</span>
          </p>
        )}
        {periodo.observaciones && (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            {periodo.observaciones}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {resumen.map(({ key, icon: Icon, label, value, tone }) => (
          <div
            key={key}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-slate-500">{label}</p>
              <p className="truncate text-sm font-bold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {periodo.detalles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Planilla vacía</p>
          <p className="mt-1 text-xs text-slate-500">
            Este periodo aún no tiene empleados registrados. Sube la planilla en Excel para
            agregarlos.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Empleado</th>
                  <th className="px-4 py-3 text-right font-semibold">Salario bruto</th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    title="% del salario bruto, ej. CCSS obrera"
                  >
                    Deducc. % (bruto)
                  </th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    title="Monto fijo decidido por el patrono, ej. préstamo"
                  >
                    Deducc. manual (neto)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">Cargas patronales</th>
                  <th className="px-4 py-3 text-right font-semibold">Salario neto</th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    title="Incapacidad por enfermedad: lo que paga la empresa, aparte del salario"
                  >
                    Incapacidad
                  </th>
                  <th className="px-4 py-3 font-semibold">Pago</th>
                  {canWrite && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{d.empleadoNombre}</p>
                        {d.numeroCuenta ? (
                          <p className="mt-0.5 text-[11px] font-normal text-slate-400">
                            {d.bancoNombre ? `${d.bancoNombre} · ` : ''}
                            {formatIban(d.numeroCuenta)}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11px] font-normal text-slate-400">
                            Sin cuenta IBAN registrada
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCRC(d.salarioBruto)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCRC(d.deduccionPorcentual)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCRC(d.deduccionManual)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCRC(d.cargasPatronales)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCRC(d.salarioNeto)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {d.incapacidad ? (
                          <span
                            title={`${d.incapacidad.diasEmpleador}d patrono / ${d.incapacidad.diasCcss}d CCSS`}
                          >
                            {formatCRC(d.incapacidad.monto)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => handleTogglePagado(d)}
                              disabled={pagandoId === d.id}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60 ${
                                d.pagado
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {pagandoId === d.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                              {d.pagado ? 'Pagado' : 'Pendiente'}
                            </button>
                          ) : (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                                d.pagado
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                  : 'bg-slate-50 text-slate-600 ring-slate-200'
                              }`}
                            >
                              {d.pagado ? 'Pagado' : 'Pendiente'}
                            </span>
                          )}
                          {d.pagado && (
                            <Link
                              href={`/comprobante/${periodo.id}/${d.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Ver comprobante de pago"
                              className="rounded-full p-1 text-slate-400 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {puedeEditar && (
                              <button
                                type="button"
                                onClick={() => setEditandoId(editandoId === d.id ? null : d.id)}
                                aria-label={
                                  editandoId === d.id ? 'Cerrar edición' : 'Editar ingresos'
                                }
                                className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                              >
                                {editandoId === d.id ? (
                                  <X className="h-3.5 w-3.5" />
                                ) : (
                                  <Pencil className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setRegistrandoIncapacidadId(
                                  registrandoIncapacidadId === d.id ? null : d.id
                                )
                              }
                              aria-label={
                                registrandoIncapacidadId === d.id
                                  ? 'Cerrar registro de incapacidad'
                                  : 'Registrar incapacidad'
                              }
                              className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60"
                            >
                              {registrandoIncapacidadId === d.id ? (
                                <X className="h-3.5 w-3.5" />
                              ) : (
                                <Stethoscope className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {puedeEditar && editandoId === d.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="mb-3 flex items-center gap-2">
                            <Pencil className="h-3.5 w-3.5 text-blue-600" />
                            <p className="text-xs font-bold text-slate-800">
                              Editar ingresos de {d.empleadoNombre}
                            </p>
                          </div>
                          <DetalleEditForm
                            detalle={d}
                            conceptosManuales={conceptosManuales}
                            onCancel={() => setEditandoId(null)}
                            onSuccess={() => {
                              setEditandoId(null)
                              router.refresh()
                            }}
                          />
                        </td>
                      </tr>
                    )}
                    {canWrite && registrandoIncapacidadId === d.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={9} className="px-4 py-4">
                          <RegistrarIncapacidadForm
                            historialLaboralId={d.historialLaboralId}
                            empleadoNombre={d.empleadoNombre}
                            onCancel={() => setRegistrandoIncapacidadId(null)}
                            onSuccess={() => setRegistrandoIncapacidadId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-100 bg-slate-50/60 text-sm font-bold text-slate-900">
                  <td className="px-4 py-3">Totales</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalBruto)}</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalDeduccionPorcentual)}</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalDeduccionManual)}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalNeto)}</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalIncapacidad)}</td>
                  <td className="px-4 py-3" />
                  {canWrite && <td className="px-4 py-3" />}
                </tr>
              </tfoot>
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
