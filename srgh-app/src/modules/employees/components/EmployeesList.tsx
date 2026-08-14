'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, SearchX, UserCheck, UserPlus, UserX, Users } from 'lucide-react'
import type { EmpleadoListItem } from '@/modules/employees/types'
import { useEmployeeFilters, type EstadoFiltro } from '@/modules/employees/hooks/useEmployeeFilters'
import { formatDate, fullName } from '@/modules/employees/lib/format'
import { usePagination } from '@/hooks/usePagination'
import { Avatar } from '@/components/ui/Avatar'
import { Pagination } from '@/components/ui/Pagination'
import {
  TABLE_HEAD,
  TABLE_ROW_CLICKABLE,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TH,
  TABLE_WRAP,
} from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

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
        <StatCard icon={Users} label="Total empleados" value={total} hoverable />
        <StatCard
          icon={UserCheck}
          tone="emerald"
          label="Con contrato vigente"
          value={activos}
          hoverable
        />
        <StatCard
          icon={UserX}
          tone="rose"
          label="Sin contrato vigente"
          value={total - activos}
          hoverable
        />
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
        <EmptyState
          icon={Users}
          title="Todavía no hay empleados registrados"
          description="Registra al primer colaborador para empezar a gestionar su información y contrato."
          action={
            canWrite && (
              <Link
                href="/employees/new"
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <UserPlus className="h-3.5 w-3.5" /> Registrar el primer empleado
              </Link>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Sin resultados"
          description="Ningún empleado coincide con la búsqueda o los filtros seleccionados."
        />
      ) : (
        <div className={TABLE_WRAP}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Colaborador</th>
                  <th className={TABLE_TH}>Puesto</th>
                  <th className={TABLE_TH}>Sucursal</th>
                  <th className={TABLE_TH}>Tipo de contrato</th>
                  <th className={TABLE_TH}>Inicio de contrato</th>
                  <th className={TABLE_TH}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((employee) => (
                  <tr
                    key={employee.emp_id}
                    onClick={() => router.push(`/employees/${employee.emp_id}`)}
                    className={TABLE_ROW_CLICKABLE}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm" fotoUrl={employee.foto_url} nombre={fullName(employee)} />
                        <div className="min-w-0">
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
                        </div>
                      </div>
                    </td>
                    <td className={TABLE_TD}>{employee.puesto_nombre ?? '—'}</td>
                    <td className={TABLE_TD}>{employee.sucursal_nombre ?? '—'}</td>
                    <td className={TABLE_TD}>{employee.tipo_contrato_nombre ?? '—'}</td>
                    <td className={TABLE_TD_NUM}>{formatDate(employee.fecha_inicio_contrato)}</td>
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
