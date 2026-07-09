'use client'

import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Pencil } from 'lucide-react'
import type { EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import { useWeekNavigation } from '@/modules/schedules/hooks/useWeekNavigation'
import { useWeeklyScheduleMatrix } from '@/modules/schedules/hooks/useWeeklyScheduleMatrix'
import { CustomHoursModal } from '@/modules/schedules/components/CustomHoursModal'

interface WeeklyScheduleMatrixProps {
  weekStartISO: string
  weekDates: string[]
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const SELECT_CLASSES =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm transition focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${dateISO}T00:00:00`))
}

function formatHours(hours: number) {
  return `${hours.toFixed(0)} Hrs`
}

function getCellLabel(index: number) {
  return DAY_NAMES[index]
}

export function WeeklyScheduleMatrix({
  weekStartISO,
  weekDates,
  rows,
  schedules,
  canWrite,
}: WeeklyScheduleMatrixProps) {
  const { isNavigating, goToPreviousWeek, goToNextWeek } = useWeekNavigation(weekStartISO)
  const {
    rows: scheduleRows,
    scheduleOptions,
    serverError,
    savingCell,
    customModalFor,
    getAssignmentValue,
    openCustomModal,
    closeCustomModal,
    handleCustomConfirm,
    handleAssignmentChange,
  } = useWeeklyScheduleMatrix({ rows, schedules, canWrite })

  return (
    <div className="space-y-5 min-w-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Matriz general de turnos por semana
            </p>
            <h3 className="mt-1 text-base font-black text-slate-900 sm:text-lg">
              Planificación y edición individual
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Edita directamente cada día por colaborador. Los cambios se guardan al instante.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={goToPreviousWeek}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              disabled={isNavigating}
            >
              <ChevronLeft className="h-4 w-4" />
              Semana anterior
            </button>
            <div className="rounded-xl bg-slate-100 px-4 py-2 text-center text-sm font-bold text-slate-800">
              Semana actual
            </div>
            <button
              type="button"
              onClick={goToNextWeek}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              disabled={isNavigating}
            >
              Semana siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {serverError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p>{serverError}</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-3 md:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Vista móvil
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Desliza entre semanas arriba y edita cada día desde las tarjetas.
          </p>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {scheduleRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-400">
              No hay colaboradores activos para mostrar en la matriz.
            </div>
          ) : (
            scheduleRows.map((row) => (
              <div
                key={row.historialLaboralId}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 text-xs font-black text-white shadow-sm">
                    {row.nombreCompleto
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part.charAt(0))
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{row.nombreCompleto}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.puesto ?? 'Sin puesto asignado'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {row.dias.map((assignment, index) => {
                    const isDisabled =
                      !canWrite || savingCell === `${row.historialLaboralId}-${assignment.fecha}`
                    const selectValue = getAssignmentValue(assignment)

                    return (
                      <div
                        key={assignment.fecha}
                        className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {getCellLabel(index)}
                            </p>
                            <p className="text-sm font-bold text-slate-900">
                              {formatDay(assignment.fecha)}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-emerald-700">
                            {assignment.horas > 0 ? `${assignment.horas.toFixed(0)} h` : '0 h'}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {canWrite ? (
                            <select
                              className={SELECT_CLASSES}
                              value={selectValue}
                              disabled={isDisabled}
                              onChange={(event) =>
                                handleAssignmentChange(row, assignment, event.target.value)
                              }
                              aria-label={`Asignar horario para ${row.nombreCompleto} el ${DAY_NAMES[index]}`}
                            >
                              <option value="">Asignar horario</option>
                              <option value="__free__">Descanso</option>
                              <option value="__custom__">Personalizado</option>
                              {scheduleOptions.map((schedule) => (
                                <option key={schedule.hor_id} value={schedule.hor_id}>
                                  {schedule.hor_nombre}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                              {assignment.esDiaLibre
                                ? 'Descanso'
                                : assignment.horaEntradaCustom
                                  ? 'Personalizado'
                                  : (assignment.horarioNombre ?? 'Sin asignar')}
                            </div>
                          )}

                          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            {assignment.esDiaLibre ? (
                              <span>Libre</span>
                            ) : assignment.horaEntradaCustom ? (
                              <>
                                <span>
                                  {assignment.horaEntradaCustom} - {assignment.horaSalidaCustom}
                                </span>
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() => openCustomModal(row, assignment)}
                                    aria-label="Editar horas"
                                    className="rounded-full p-0.5 transition hover:bg-indigo-50"
                                  >
                                    <Pencil className="h-3 w-3 text-indigo-600" />
                                  </button>
                                )}
                              </>
                            ) : assignment.horaEntrada && assignment.horaSalida ? (
                              <span>
                                {assignment.horaEntrada} - {assignment.horaSalida}
                              </span>
                            ) : (
                              <span>Sin horario</span>
                            )}

                            {isDisabled ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  <span>Total semanal</span>
                  <span>{formatHours(row.totalSemanal)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm min-w-[1100px] lg:min-w-[980px] xl:min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="sticky left-0 z-20 min-w-[180px] border-b border-slate-200 bg-slate-50 px-4 py-3.5 text-left font-bold">
                    Colaborador
                  </th>
                  {weekDates.map((dateISO, index) => (
                    <th
                      key={dateISO}
                      className="min-w-[112px] border-b border-slate-200 px-4 py-3.5 text-center font-bold"
                    >
                      <div className="space-y-1">
                        <div className="text-[11px] leading-tight">{DAY_NAMES[index]}</div>
                        <div className="text-slate-400">{formatDay(dateISO)}</div>
                      </div>
                    </th>
                  ))}
                  <th className="min-w-[128px] border-b border-slate-200 px-4 py-3.5 text-center font-bold">
                    Total semanal
                  </th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No hay colaboradores activos para mostrar en la matriz.
                    </td>
                  </tr>
                ) : (
                  scheduleRows.map((row) => (
                    <tr
                      key={row.historialLaboralId}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 text-xs font-black text-white shadow-sm">
                            {row.nombreCompleto
                              .split(' ')
                              .slice(0, 2)
                              .map((part) => part.charAt(0))
                              .join('')}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">
                              {row.nombreCompleto}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {row.puesto ?? 'Sin puesto asignado'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {row.dias.map((assignment, index) => {
                        const isDisabled =
                          !canWrite ||
                          savingCell === `${row.historialLaboralId}-${assignment.fecha}`
                        const selectValue = getAssignmentValue(assignment)

                        return (
                          <td
                            key={assignment.fecha}
                            className="border-b border-slate-100 px-2 py-3.5"
                          >
                            <div className="min-h-[92px] rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                              {canWrite ? (
                                <select
                                  className={SELECT_CLASSES}
                                  value={selectValue}
                                  disabled={isDisabled}
                                  onChange={(event) =>
                                    handleAssignmentChange(row, assignment, event.target.value)
                                  }
                                  aria-label={`Asignar horario para ${row.nombreCompleto} el ${DAY_NAMES[index]}`}
                                >
                                  <option value="">Asignar horario</option>
                                  <option value="__free__">Descanso</option>
                                  <option value="__custom__">Personalizado</option>
                                  {scheduleOptions.map((schedule) => (
                                    <option key={schedule.hor_id} value={schedule.hor_id}>
                                      {schedule.hor_nombre}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                                  {assignment.esDiaLibre
                                    ? 'Descanso'
                                    : assignment.horaEntradaCustom
                                      ? 'Personalizado'
                                      : (assignment.horarioNombre ?? 'Sin asignar')}
                                </div>
                              )}

                              <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
                                {assignment.esDiaLibre ? (
                                  <span>Libre</span>
                                ) : assignment.horaEntradaCustom ? (
                                  <>
                                    <span>
                                      {assignment.horaEntradaCustom} - {assignment.horaSalidaCustom}
                                    </span>
                                    {canWrite && (
                                      <button
                                        type="button"
                                        onClick={() => openCustomModal(row, assignment)}
                                        aria-label="Editar horas"
                                        className="rounded-full p-0.5 transition hover:bg-indigo-50"
                                      >
                                        <Pencil className="h-3 w-3 text-indigo-600" />
                                      </button>
                                    )}
                                  </>
                                ) : assignment.horaEntrada && assignment.horaSalida ? (
                                  <span>
                                    {assignment.horaEntrada} - {assignment.horaSalida}
                                  </span>
                                ) : (
                                  <span>Sin horario</span>
                                )}

                                {isDisabled ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                ) : null}
                              </div>
                            </div>
                          </td>
                        )
                      })}

                      <td className="border-b border-slate-100 px-4 py-3.5 text-center">
                        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                          {formatHours(row.totalSemanal)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {customModalFor && (
          <CustomHoursModal
            employeeName={customModalFor.row.nombreCompleto}
            dayLabel={DAY_NAMES[weekDates.indexOf(customModalFor.assignment.fecha)] ?? 'Día'}
            initialEntrada={customModalFor.assignment.horaEntradaCustom ?? '08:00'}
            initialSalida={customModalFor.assignment.horaSalidaCustom ?? '17:00'}
            onClose={closeCustomModal}
            onConfirm={handleCustomConfirm}
          />
        )}
      </div>
    </div>
  )
}
