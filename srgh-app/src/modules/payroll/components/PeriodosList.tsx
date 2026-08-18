'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, FileClock } from 'lucide-react'
import type { PeriodoListItem } from '@/modules/payroll/types'
import {
  ESTADO_LABELS,
  estadoBadgeTone,
  estadoLabel,
  formatDate,
  periodoLabel,
} from '@/modules/payroll/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { META_LABEL, TABLE_TD, TABLE_TH } from '@/components/ui/styles'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils/cn'

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
      tone: 'bg-brand-50 text-brand-600',
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
    <div className="@container space-y-4">
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2">
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

      {/*
        Los dos filtros comparten el ancho y bajan de linea juntos: con
        `basis-40` cada uno se comprime hasta ahi y despues envuelve, en vez
        de que uno quede larguisimo y el otro aplastado. `min-w-0` es lo que
        permite que se compriman en lugar de estirar el contenedor.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectMenu
          ariaLabel="Filtrar por estado"
          value={estado}
          onChange={setEstado}
          className="min-w-0 flex-1 basis-40"
          options={[
            { value: 'todos', label: 'Todos los estados' },
            ...Object.entries(ESTADO_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <SelectMenu
          ariaLabel="Filtrar por año"
          value={anio}
          onChange={setAnio}
          className="min-w-0 flex-1 basis-40"
          options={[
            { value: 'todos', label: 'Todos los años' },
            ...anios.map((a) => ({ value: String(a), label: String(a) })),
          ]}
        />
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
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            Movil: tarjeta por periodo. La tabla declara `min-w-[640px]`, asi
            que en 375px el scroll horizontal era obligatorio y escondia los
            encabezados. El `min-w` sigue siendo correcto de @3xl para arriba,
            donde ya hay espacio.
          */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedItems.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/payroll/${p.id}`)}
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  className="animate-fade-in block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-900">
                        {periodoLabel(p.mes, p.anio, p.quincena)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{p.sucursalNombre}</p>
                    </div>
                    <Badge tone={estadoBadgeTone(p.estado)}>{estadoLabel(p.estado)}</Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                    {[
                      {
                        label: 'Rango',
                        valor: `${formatDate(p.fechaInicio)} — ${formatDate(p.fechaFin)}`,
                      },
                      { label: 'Empleados', valor: String(p.totalEmpleados) },
                      { label: 'Fecha de pago', valor: formatDate(p.fechaPago) },
                    ].map(({ label, valor }) => (
                      <div key={label} className="min-w-0">
                        <dt className={META_LABEL}>{label}</dt>
                        <dd className="mt-0.5 break-words text-xs tabular-nums text-slate-600">
                          {valor}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden @3xl:block @3xl:overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className={TABLE_TH}>Periodo</th>
                  <th className={TABLE_TH}>Sucursal</th>
                  <th className={TABLE_TH}>Rango de fechas</th>
                  <th className={TABLE_TH}>Empleados</th>
                  <th className={TABLE_TH}>Estado</th>
                  <th className={TABLE_TH}>Fecha de pago</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/payroll/${p.id}`)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {periodoLabel(p.mes, p.anio, p.quincena)}
                    </td>
                    <td className={TABLE_TD}>{p.sucursalNombre}</td>
                    <td className={TABLE_TD}>
                      {formatDate(p.fechaInicio)} — {formatDate(p.fechaFin)}
                    </td>
                    <td className={TABLE_TD}>{p.totalEmpleados}</td>
                    <td className="px-3 py-2">
                      <Badge tone={estadoBadgeTone(p.estado)}>{estadoLabel(p.estado)}</Badge>
                    </td>
                    <td className={TABLE_TD}>{formatDate(p.fechaPago)}</td>
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
