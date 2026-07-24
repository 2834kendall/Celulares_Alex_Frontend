'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, FileClock } from 'lucide-react'
import type { PeriodoListItem } from '@/modules/payroll/types'
import {
  ESTADO_LABELS,
  estadoBadgeClasses,
  estadoLabel,
  formatDate,
  periodoLabel,
} from '@/modules/payroll/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'

const SELECT_CLASSES =
  'rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10'

interface PeriodosListProps {
  periodos: PeriodoListItem[]
}

export function PeriodosList({ periodos }: PeriodosListProps) {
  const router = useRouter()
  const [estado, setEstado] = useState('todos')
  const [anio, setAnio] = useState('todos')

  const anios = useMemo(
    () => [...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a),
    [periodos]
  )

  const filtered = useMemo(
    () =>
      periodos.filter(
        (p) =>
          (estado === 'todos' || p.estado === estado) &&
          (anio === 'todos' || p.anio === Number(anio))
      ),
    [periodos, estado, anio]
  )

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    filtered,
    8
  )

  const total = periodos.length
  const borradores = periodos.filter((p) => p.estado === 'borrador').length

  const stats = [
    {
      key: 'total',
      icon: CalendarDays,
      label: 'Periodos',
      value: total,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'borradores',
      icon: FileClock,
      label: 'En borrador',
      value: borradores,
      tone: 'bg-amber-50 text-amber-600',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {stats.map(({ key, icon: Icon, label, value, tone }) => (
          <div
            key={key}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-slate-500">{label}</p>
              <p className="text-sm font-bold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar por estado"
          className={SELECT_CLASSES}
        >
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADO_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          aria-label="Filtrar por año"
          className={SELECT_CLASSES}
        >
          <option value="todos">Todos los años</option>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Sin periodos de nómina</p>
          <p className="mt-1 text-xs text-slate-500">
            {total === 0
              ? 'Crea el primer periodo de planilla para empezar a procesar la nómina.'
              : 'Ningún periodo coincide con los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Periodo</th>
                  <th className="px-4 py-3 font-semibold">Sucursal</th>
                  <th className="px-4 py-3 font-semibold">Rango de fechas</th>
                  <th className="px-4 py-3 font-semibold">Empleados</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Fecha de pago</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/payroll/${p.id}`)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {periodoLabel(p.mes, p.anio, p.quincena)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.sucursalNombre}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(p.fechaInicio)} — {formatDate(p.fechaFin)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.totalEmpleados}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${estadoBadgeClasses(p.estado)}`}
                      >
                        {estadoLabel(p.estado)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.fechaPago)}</td>
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
