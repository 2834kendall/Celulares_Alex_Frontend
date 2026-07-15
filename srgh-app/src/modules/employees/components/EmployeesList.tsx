'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, UserCheck, UserPlus, Users, UserX } from 'lucide-react'
import type { EmpleadoListItem } from '@/modules/employees/types'
import { useEmployeeFilters, type EstadoFiltro } from '@/modules/employees/hooks/useEmployeeFilters'
import { formatDate, fullName } from '@/modules/employees/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'

const SELECT_CLASSES =
  'rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10'

interface EmployeesListProps {
  employees: EmpleadoListItem[]
  canWrite: boolean
}

export function EmployeesList({ employees, canWrite }: EmployeesListProps) {
  const router = useRouter()

  const {
    search,
    setSearch,
    estado,
    setEstado,
    tipoContrato,
    setTipoContrato,
    tiposContrato,
    filtered,
  } = useEmployeeFilters(employees)

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    filtered,
    6
  )

  const total = employees.length
  const activos = employees.filter((e) => e.activo).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Total empleados</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{total}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Con contrato vigente</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{activos}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <UserX className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Sin contrato vigente</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{total - activos}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Buscar empleado</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o identificación…"
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filtrar por estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoFiltro)}
            className={SELECT_CLASSES}
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filtrar por tipo de contrato</span>
          <select
            value={tipoContrato}
            onChange={(e) => setTipoContrato(e.target.value)}
            className={SELECT_CLASSES}
          >
            <option value="todos">Todos los contratos</option>
            {tiposContrato.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {employees.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Todavía no hay empleados registrados
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Registra al primer colaborador para empezar a gestionar su información y contrato.
            </p>
          </div>
          {canWrite && (
            <Link
              href="/employees/new"
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <UserPlus className="h-3.5 w-3.5" /> Registrar el primer empleado
            </Link>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Sin resultados</p>
          <p className="max-w-sm text-xs text-slate-500">
            Ningún empleado coincide con la búsqueda o los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Colaborador</th>
                  <th className="px-3 py-2 text-left font-semibold">Puesto</th>
                  <th className="px-3 py-2 text-left font-semibold">Sucursal</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo de contrato</th>
                  <th className="px-3 py-2 text-left font-semibold">Inicio de contrato</th>
                  <th className="px-3 py-2 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((employee) => (
                  <tr
                    key={employee.emp_id}
                    onClick={() => router.push(`/employees/${employee.emp_id}`)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/70"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/employees/${employee.emp_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-slate-800 outline-none transition hover:text-blue-700 focus-visible:underline"
                      >
                        {fullName(employee)}
                      </Link>
                      <p className="text-[11px] text-slate-500">
                        {employee.emp_numero_identificacion}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{employee.puesto_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{employee.sucursal_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {employee.tipo_contrato_nombre ?? '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {formatDate(employee.fecha_inicio_contrato)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          employee.activo
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {employee.activo ? 'Activo' : 'Inactivo'}
                      </span>
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
