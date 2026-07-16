import { Banknote, CalendarDays, Users } from 'lucide-react'
import type { PeriodoDetalle } from '@/modules/payroll/types'
import {
  estadoBadgeClasses,
  estadoLabel,
  formatCRC,
  formatDate,
  periodoLabel,
} from '@/modules/payroll/lib/format'

interface PeriodoDetailProps {
  periodo: PeriodoDetalle
}

/** Cabecera del periodo + tabla de planilla (server component, solo lectura). */
export function PeriodoDetail({ periodo }: PeriodoDetailProps) {
  const totalBruto = periodo.detalles.reduce((sum, d) => sum + d.salarioBruto, 0)
  const totalDeducciones = periodo.detalles.reduce((sum, d) => sum + d.totalDeducciones, 0)
  const totalNeto = periodo.detalles.reduce((sum, d) => sum + d.salarioNeto, 0)

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
            Este periodo aún no tiene empleados registrados. El cálculo de la planilla se agregará
            en la siguiente iteración del módulo.
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
                  <th className="px-4 py-3 text-right font-semibold">Deducciones</th>
                  <th className="px-4 py-3 text-right font-semibold">Cargas patronales</th>
                  <th className="px-4 py-3 text-right font-semibold">Salario neto</th>
                  <th className="px-4 py-3 font-semibold">Pago</th>
                </tr>
              </thead>
              <tbody>
                {periodo.detalles.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-slate-900">{d.empleadoNombre}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCRC(d.salarioBruto)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCRC(d.totalDeducciones)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCRC(d.cargasPatronales)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCRC(d.salarioNeto)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                          d.pagado
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-slate-50 text-slate-600 ring-slate-200'
                        }`}
                      >
                        {d.pagado ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-100 bg-slate-50/60 text-sm font-bold text-slate-900">
                  <td className="px-4 py-3">Totales</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalBruto)}</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalDeducciones)}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right">{formatCRC(totalNeto)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
