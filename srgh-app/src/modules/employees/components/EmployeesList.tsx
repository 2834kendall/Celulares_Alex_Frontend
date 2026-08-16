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
  META_LABEL,
  SELECT,
  TABLE_HEAD,
  TABLE_ROW_CLICKABLE,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TH,
} from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

interface EmployeesListProps {
  employees: EmpleadoListItem[]
  canWrite: boolean
}

/** Estado del contrato. Lo rinden las dos vistas: tarjetas en movil y tabla. */
function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        activo ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
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
    // Se mide el contenedor y no el viewport: el sidebar ocupa 256px y ademas
    // se colapsa, asi que a un mismo ancho de pantalla el espacio real puede
    // ser muy distinto. Mismo criterio que asistencia.
    <div className="@container space-y-4">
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-3">
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
            // Mismas metricas verticales que SELECT (py-2, min-h-11 con dedo):
            // el buscador y los selects de al lado compartian fila con alturas
            // distintas y eso era gran parte de lo que se leia "desalineado".
            // El padding izquierdo queda aparte (pl-8, para el icono) porque
            // por eso este campo nunca uso el token INPUT compartido.
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 pointer-coarse:min-h-11"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filtrar por estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoFiltro)}
            className={SELECT}
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
            className={SELECT}
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
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:scale-[0.98]"
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
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            En movil, la tarjeta ENTERA es el enlace. En la tabla solo el
            nombre lo era (la fila navegaba por onClick, que el teclado no
            alcanza): aca el area util es de ~90px de alto, imposible de
            errar con el pulgar, y al ser un <Link> real se puede abrir en
            otra pestaña y se anuncia como enlace.
          */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedItems.map((employee, index) => (
              <li
                key={employee.emp_id}
                // Entrada en cascada, cortada a los 6 primeros para que la
                // ultima tarjeta de la pagina no se haga esperar.
                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                className="animate-fade-in"
              >
                <Link
                  href={`/employees/${employee.emp_id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm outline-none transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar size="sm" fotoUrl={employee.foto_url} nombre={fullName(employee)} />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-800">
                          {fullName(employee)}
                        </p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                          {employee.emp_numero_identificacion}
                        </p>
                      </div>
                    </div>
                    <EstadoBadge activo={employee.activo} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                    {[
                      { label: 'Puesto', valor: employee.puesto_nombre },
                      { label: 'Sucursal', valor: employee.sucursal_nombre },
                      { label: 'Contrato', valor: employee.tipo_contrato_nombre },
                      { label: 'Inicio', valor: formatDate(employee.fecha_inicio_contrato) },
                    ].map(({ label, valor }) => (
                      <div key={label} className="min-w-0">
                        <dt className={META_LABEL}>{label}</dt>
                        <dd className="mt-0.5 break-words text-xs text-slate-600">
                          {valor || '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden @3xl:block @3xl:overflow-x-auto">
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
                            className="font-medium text-slate-800 outline-none transition hover:text-brand-700 focus-visible:underline"
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
                      <EstadoBadge activo={employee.activo} />
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
