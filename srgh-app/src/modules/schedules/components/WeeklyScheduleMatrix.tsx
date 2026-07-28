'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Baby,
  CalendarClock,
  HeartPulse,
  Loader2,
  Pencil,
  RotateCcw,
  Users,
} from 'lucide-react'
import type { EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import { WEEKDAY_NAMES, currentMondayISO, getWeekDates } from '@/modules/schedules/lib/week'
import { stripSeconds } from '@/modules/schedules/lib/time'
import { useWeekNavigation } from '@/modules/schedules/hooks/useWeekNavigation'
import {
  useWeeklyScheduleMatrix,
  type DayAssignmentWithAusencia,
} from '@/modules/schedules/hooks/useWeeklyScheduleMatrix'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { CustomHoursModal } from '@/modules/schedules/components/CustomHoursModal'
import type { AusenciaOverlayEntry } from '@/modules/absences/lib/overlay'

interface WeeklyScheduleMatrixProps {
  weekStartISO: string
  weekDates: string[]
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
  ausencias?: AusenciaOverlayEntry[]
}

const SELECT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${dateISO}T00:00:00`))
}

/** Integers with no decimals, fractions with one (7.5 must not show as 8). */
function formatHoursValue(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

function formatHours(hours: number) {
  return `${formatHoursValue(hours)} Hrs`
}

function initialsOf(fullName: string) {
  return fullName
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
}

function assignmentLabel(assignment: DayAssignmentWithAusencia) {
  if (assignment.isDayOff) return 'Descanso'
  if (assignment.customStartTime) return 'Personalizado'
  return assignment.scheduleName ?? 'Sin asignar'
}

/** Insignia compacta para el tipo de ausencia — misma idea que la de lactancia, reutilizada para incapacidades/licencias que bloquean el dia. */
function AusenciaBadge({ tipoNombre }: { tipoNombre: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-center text-[10px] font-bold leading-tight text-rose-700">
      <HeartPulse className="h-3 w-3 shrink-0" />
      {tipoNombre}
    </span>
  )
}

function AssignmentOptions({ scheduleOptions }: { scheduleOptions: ScheduleRow[] }) {
  return (
    <>
      <option value="">Asignar horario</option>
      <option value="__free__">Descanso</option>
      <option value="__custom__">Personalizado</option>
      {scheduleOptions.map((schedule) => (
        <option key={schedule.hor_id} value={schedule.hor_id}>
          {schedule.hor_nombre}
        </option>
      ))}
    </>
  )
}

interface AssignmentHoursLineProps {
  assignment: DayAssignmentWithAusencia
  canWrite: boolean
  isSaving: boolean
  onEditCustom: () => void
  variant: 'mobile' | 'desktop'
}

/** Cell's hours line (range, custom-edit pencil, lactancia badge, and saving spinner). */
function AssignmentHoursLine({
  assignment,
  canWrite,
  isSaving,
  onEditCustom,
  variant,
}: AssignmentHoursLineProps) {
  const isBlocked = Boolean(assignment.ausencia && !assignment.ausencia.isIntraday)

  // La insignia del tipo de ausencia ya se muestra donde iria el select; no
  // hay horas que mostrar debajo para un dia bloqueado.
  if (isBlocked) {
    return null
  }

  const containerClass =
    variant === 'mobile'
      ? 'mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-semibold tabular-nums text-slate-500'
      : `flex flex-wrap items-center gap-1 text-[10px] tabular-nums ${
          assignment.isDayOff
            ? 'text-amber-700'
            : assignment.customStartTime
              ? 'text-violet-700'
              : 'text-slate-400'
        }`

  return (
    <div className={containerClass}>
      {assignment.isDayOff ? (
        variant === 'mobile' ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Libre</span>
        ) : (
          <span>Libre</span>
        )
      ) : assignment.customStartTime ? (
        <>
          <span>
            {stripSeconds(assignment.customStartTime)} - {stripSeconds(assignment.customEndTime)}
          </span>
          {canWrite && (
            <button
              type="button"
              onClick={onEditCustom}
              aria-label="Editar horas"
              className="rounded-full p-0.5 outline-none transition hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-violet-500/60"
            >
              <Pencil className="h-3 w-3 text-violet-600" />
            </button>
          )}
        </>
      ) : assignment.startTime && assignment.endTime ? (
        <span>
          {stripSeconds(assignment.startTime)} - {stripSeconds(assignment.endTime)}
        </span>
      ) : (
        <span>Sin horario</span>
      )}

      {assignment.ausencia?.isIntraday && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-100 px-1.5 py-0.5 text-[9px] font-bold text-pink-700">
          <Baby className="h-2.5 w-2.5" /> Lactancia
        </span>
      )}

      {isSaving && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
    </div>
  )
}

export function WeeklyScheduleMatrix({
  weekStartISO,
  weekDates,
  rows,
  schedules,
  canWrite,
  ausencias,
}: WeeklyScheduleMatrixProps) {
  const { isNavigating, goToWeekStart } = useWeekNavigation(weekStartISO)
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
  } = useWeeklyScheduleMatrix({ rows, schedules, canWrite, ausencias })

  const [branchFilter, setBranchFilter] = useState<'all' | number>('all')
  const [selectedDayIndexes, setSelectedDayIndexes] = useState<number[]>([])

  const branchOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of scheduleRows) {
      if (!map.has(row.branchId)) map.set(row.branchId, row.branchName ?? 'Sin sucursal')
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [scheduleRows])

  const filteredRows = useMemo(
    () =>
      branchFilter === 'all'
        ? scheduleRows
        : scheduleRows.filter((row) => row.branchId === branchFilter),
    [scheduleRows, branchFilter]
  )

  const visibleColumns = useMemo(
    () =>
      weekDates
        .map((dateISO, index) => ({ dateISO, index }))
        .filter(
          (column) => selectedDayIndexes.length === 0 || selectedDayIndexes.includes(column.index)
        ),
    [weekDates, selectedDayIndexes]
  )

  function toggleDayIndex(index: number) {
    setSelectedDayIndexes((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    )
  }

  const {
    page,
    totalPages,
    paginatedItems: paginatedRows,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(filteredRows, 6)

  const isCurrentWeek = weekStartISO === currentMondayISO()

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative z-30 rounded-xl border border-slate-200 bg-linear-to-br from-white via-white to-blue-50/50 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Matriz general de turnos por semana
            </p>
            <h3 className="mt-1 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              Planificación y edición individual
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-start">
            <div className="flex min-w-[140px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-center shadow-sm">
              {isNavigating ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
              )}
              <p className="text-xs font-bold tabular-nums text-slate-900">
                {formatDay(weekDates[0])} – {formatDay(weekDates[6])}
              </p>
            </div>

            <label
              className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500 shadow-sm outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-within:ring-2 focus-within:ring-blue-500/60"
              aria-label="Ir a una semana especifica"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <input
                type="date"
                value={weekStartISO}
                disabled={isNavigating}
                onChange={(event) => {
                  const picked = event.target.value
                  if (!picked) return
                  goToWeekStart(getWeekDates(picked)[0])
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>

            <button
              type="button"
              onClick={() => goToWeekStart(currentMondayISO())}
              disabled={isNavigating || isCurrentWeek}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-500 shadow-sm outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Semana actual
            </button>
          </div>
        </div>

        {serverError && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
            <p>{serverError}</p>
          </div>
        )}

        <div className="mt-3.5 flex flex-col gap-3 border-t border-slate-100 pt-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Sucursal:
            <SearchSelect
              ariaLabel="Filtrar por sucursal"
              className="w-48"
              value={branchFilter === 'all' ? 'all' : String(branchFilter)}
              onChange={(v) => setBranchFilter(v === 'all' ? 'all' : Number(v))}
              options={[
                { value: 'all', label: 'Todas las sucursales' },
                ...branchOptions.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">Días:</span>
            {WEEKDAY_NAMES.map((name, index) => {
              const active = selectedDayIndexes.includes(index)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleDayIndex(index)}
                  aria-pressed={active}
                  className={`rounded-lg px-2 py-1 text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="border-b border-slate-200/80 p-3 md:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Vista móvil
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Desliza entre semanas arriba y edita cada día desde las tarjetas.
          </p>
        </div>

        <div className="space-y-2 p-2.5 md:hidden">
          {filteredRows.length === 0 ? (
            <EmptyState hasUnfilteredRows={scheduleRows.length > 0} />
          ) : (
            paginatedRows.map((row) => (
              <div
                key={row.employmentHistoryId}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
              >
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-900 to-blue-600 text-[10px] font-bold text-white shadow-sm">
                    {initialsOf(row.fullName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{row.fullName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.position ?? 'Sin puesto asignado'}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleColumns.map(({ index }) => {
                    const assignment = row.days[index]
                    const isSaving = savingCell === `${row.employmentHistoryId}-${assignment.date}`
                    const isBlocked = Boolean(
                      assignment.ausencia && !assignment.ausencia.isIntraday
                    )
                    const isDisabled = !canWrite || isSaving || isBlocked
                    const isFree = assignment.isDayOff
                    const isCustom = Boolean(assignment.customStartTime)

                    return (
                      <div
                        key={assignment.date}
                        className={`rounded-xl border p-2.5 transition ${
                          isFree
                            ? 'border-amber-200 bg-amber-50/80'
                            : isCustom
                              ? 'border-violet-200 bg-violet-50/80'
                              : 'border-slate-200 bg-slate-50/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {WEEKDAY_NAMES[index]}
                            </p>
                            <p className="text-xs font-bold text-slate-900 sm:text-sm">
                              {formatDay(assignment.date)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                              isFree
                                ? 'bg-amber-100 text-amber-800'
                                : isCustom
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-white text-emerald-700'
                            }`}
                          >
                            {assignment.hours > 0
                              ? `${formatHoursValue(assignment.hours)} h`
                              : '0 h'}
                          </span>
                        </div>

                        <div className="mt-2.5 space-y-2">
                          {isBlocked ? (
                            <AusenciaBadge tipoNombre={assignment.ausencia!.tipoNombre} />
                          ) : canWrite ? (
                            <select
                              className={SELECT_CLASSES}
                              value={getAssignmentValue(assignment)}
                              disabled={isDisabled}
                              onChange={(event) =>
                                handleAssignmentChange(row, assignment, event.target.value)
                              }
                              aria-label={`Asignar horario para ${row.fullName} el ${WEEKDAY_NAMES[index]}`}
                            >
                              <AssignmentOptions scheduleOptions={scheduleOptions} />
                            </select>
                          ) : (
                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                              {assignmentLabel(assignment)}
                            </div>
                          )}

                          <AssignmentHoursLine
                            assignment={assignment}
                            canWrite={canWrite}
                            isSaving={isSaving}
                            onEditCustom={() => openCustomModal(row, assignment)}
                            variant="mobile"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold tabular-nums text-emerald-700">
                  <span>Total semanal</span>
                  <span>{formatHours(row.weeklyTotal)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-separate border-spacing-0 text-xs lg:min-w-[760px] xl:min-w-[820px]">
              <thead>
                <tr className="bg-slate-50/90 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="sticky left-0 z-20 min-w-[160px] border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-left font-bold backdrop-blur-sm">
                    Colaborador
                  </th>
                  {visibleColumns.map(({ dateISO, index }) => (
                    <th
                      key={dateISO}
                      className="min-w-[88px] border-b border-slate-200 px-2 py-2 text-center font-bold"
                    >
                      <div className="space-y-1">
                        <div className="text-[10px] leading-tight text-slate-500">
                          {WEEKDAY_NAMES[index]}
                        </div>
                        <div className="font-semibold tabular-nums text-slate-400">
                          {formatDay(dateISO)}
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="min-w-[100px] border-b border-slate-200 px-2 py-2 text-center font-bold">
                    Total semanal
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-4 py-10">
                      <EmptyState hasUnfilteredRows={scheduleRows.length > 0} />
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.employmentHistoryId}
                      className="group align-top transition hover:bg-slate-50/60"
                    >
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2.5 group-hover:bg-slate-50/60">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-900 to-blue-600 text-[10px] font-bold text-white shadow-sm">
                            {initialsOf(row.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">{row.fullName}</p>
                            <p className="truncate text-[11px] text-slate-500">
                              {row.position ?? 'Sin puesto asignado'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {visibleColumns.map(({ index }) => {
                        const assignment = row.days[index]
                        const isSaving =
                          savingCell === `${row.employmentHistoryId}-${assignment.date}`
                        const isBlocked = Boolean(
                          assignment.ausencia && !assignment.ausencia.isIntraday
                        )
                        const isDisabled = !canWrite || isSaving || isBlocked
                        const isFree = assignment.isDayOff
                        const isCustom = Boolean(assignment.customStartTime)

                        return (
                          <td
                            key={assignment.date}
                            className="border-b border-slate-100 px-1 py-2 group-hover:bg-slate-50/30"
                          >
                            <div className="flex justify-center">
                              <div
                                className={`flex min-w-[82px] flex-col items-center gap-1 rounded-xl border px-2 py-1.5 shadow-sm transition-colors ${
                                  isFree
                                    ? 'border-amber-200 bg-amber-50'
                                    : isCustom
                                      ? 'border-violet-200 bg-violet-50'
                                      : 'border-slate-200 bg-white'
                                }`}
                              >
                                {isBlocked ? (
                                  <AusenciaBadge tipoNombre={assignment.ausencia!.tipoNombre} />
                                ) : canWrite ? (
                                  <select
                                    className={`w-full appearance-none bg-transparent text-center text-[12px] font-semibold outline-none ${
                                      isFree
                                        ? 'text-amber-800'
                                        : isCustom
                                          ? 'text-violet-800'
                                          : 'text-slate-900'
                                    } ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                    value={getAssignmentValue(assignment)}
                                    disabled={isDisabled}
                                    onChange={(event) =>
                                      handleAssignmentChange(row, assignment, event.target.value)
                                    }
                                    aria-label={`Asignar horario para ${row.fullName} el ${WEEKDAY_NAMES[index]}`}
                                  >
                                    <AssignmentOptions scheduleOptions={scheduleOptions} />
                                  </select>
                                ) : (
                                  <span
                                    className={`text-[12px] font-semibold ${
                                      isFree
                                        ? 'text-amber-800'
                                        : isCustom
                                          ? 'text-violet-800'
                                          : 'text-slate-900'
                                    }`}
                                  >
                                    {assignmentLabel(assignment)}
                                  </span>
                                )}

                                <AssignmentHoursLine
                                  assignment={assignment}
                                  canWrite={canWrite}
                                  isSaving={isSaving}
                                  onEditCustom={() => openCustomModal(row, assignment)}
                                  variant="desktop"
                                />
                              </div>
                            </div>
                          </td>
                        )
                      })}

                      <td className="border-b border-slate-100 px-3 py-2.5 text-center">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold tabular-nums text-emerald-700 shadow-sm">
                          {formatHours(row.weeklyTotal)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {filteredRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        )}

        {customModalFor && (
          <CustomHoursModal
            employeeName={customModalFor.row.fullName}
            dayLabel={WEEKDAY_NAMES[weekDates.indexOf(customModalFor.assignment.date)] ?? 'Día'}
            weekDates={weekDates}
            initialDate={customModalFor.assignment.date}
            unavailableDates={customModalFor.row.days
              .filter((d) => d.ausencia && !d.ausencia.isIntraday)
              .map((d) => d.date)}
            initialStartTime={stripSeconds(customModalFor.assignment.customStartTime) ?? '08:00'}
            initialEndTime={stripSeconds(customModalFor.assignment.customEndTime) ?? '17:00'}
            initialLunchStart={stripSeconds(customModalFor.assignment.customLunchStart)}
            initialLunchEnd={stripSeconds(customModalFor.assignment.customLunchEnd)}
            initialBreakStart={stripSeconds(customModalFor.assignment.customBreakStart)}
            initialBreakEnd={stripSeconds(customModalFor.assignment.customBreakEnd)}
            onClose={closeCustomModal}
            onConfirm={handleCustomConfirm}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState({ hasUnfilteredRows = false }: { hasUnfilteredRows?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Users className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">
          {hasUnfilteredRows
            ? 'Ningún colaborador coincide con los filtros'
            : 'No hay colaboradores activos para esta semana'}
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          {hasUnfilteredRows
            ? 'Ajusta el filtro de sucursal o de días para ver resultados.'
            : 'Cuando el equipo tenga historial laboral activo, la matriz semanal aparecerá aquí.'}
        </p>
      </div>
    </div>
  )
}
