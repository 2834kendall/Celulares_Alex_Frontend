'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  Baby,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react'
import type { EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import {
  WEEKDAY_NAMES,
  currentMondayISO,
  getWeekDates,
  shiftWeekISO,
  toISODate,
} from '@/modules/schedules/lib/week'
import { stripSeconds } from '@/modules/schedules/lib/time'
import { useWeekNavigation } from '@/modules/schedules/hooks/useWeekNavigation'
import {
  useWeeklyScheduleMatrix,
  type DayAssignmentWithAusencia,
  type EmployeeWeekRowWithAusencia,
} from '@/modules/schedules/hooks/useWeeklyScheduleMatrix'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { META_LABEL } from '@/components/ui/styles'
import { CustomHoursModal } from '@/modules/schedules/components/CustomHoursModal'
import type { AusenciaOverlayEntry } from '@/modules/absences/lib/overlay'
import { IconButton } from '@/components/ui/IconButton'
import { DatePopover } from '@/components/ui/DatePickerButton'
import { EmptyState } from '@/components/ui/EmptyState'

interface WeeklyScheduleMatrixProps {
  weekStartISO: string
  weekDates: string[]
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
  ausencias?: AusenciaOverlayEntry[]
}

/** Neutro frio de la cabecera y del riel fijo de colaboradores. */
const RAIL_BG = '#F7F8FA'

interface CellPalette {
  fill: string
  border: string
  stripe: string
}

/**
 * Cada horario recibe un color estable segun su hor_id para distinguir turnos
 * de un vistazo. Todos los tonos viven en la misma banda de luminosidad y baja
 * saturacion para que la matriz se lea como un conjunto y no como un arcoiris.
 * `stripe` es el tono del rayado diagonal que marca los dias de descanso.
 *
 * La lavanda y el rosa palo quedan fuera de la rotacion: estan reservados a
 * "Personalizado" y a las ausencias.
 */
const SCHEDULE_PALETTE: CellPalette[] = [
  { fill: '#E7EEFC', border: '#C5D3EB', stripe: '#D7E3F6' }, // azul bruma
  { fill: '#FBEDDC', border: '#EDD5B4', stripe: '#F5E2CA' }, // durazno
  { fill: '#DFF2E7', border: '#B8DCC7', stripe: '#CEEADA' }, // menta
  { fill: '#F9F1D0', border: '#E6D8A2', stripe: '#F1E8BE' }, // amarillo
  { fill: '#DEF0F5', border: '#B4D9E3', stripe: '#CDE7EE' }, // aqua
  { fill: '#F1EBE2', border: '#D6C9B6', stripe: '#E6DDCF' }, // arena
]

const CUSTOM_PALETTE: CellPalette = { fill: '#EDEAFC', border: '#D0C8EE', stripe: '#E1DCF6' }
const NEUTRAL_STRIPE = '#E2E8F0'

/**
 * Ausencias en rosa palo apagado: mismo nivel de luminosidad que el resto de
 * la paleta, sin el rojo de alerta que competia con los horarios.
 */
const ABSENCE_PALETTE = { fill: '#F8EBEF', border: '#E6CDD5', text: '#856874', icon: '#BC9BA6' }
const LACTANCIA_TEXT = '#8B6A7C'

function paletteFor(assignment: DayAssignmentWithAusencia): CellPalette | null {
  if (assignment.customStartTime) return CUSTOM_PALETTE
  if (assignment.scheduleId == null) return null
  return SCHEDULE_PALETTE[assignment.scheduleId % SCHEDULE_PALETTE.length]
}

/** Rayado diagonal "/" al estilo de los dias no laborables del calendario. */
function hatchStyle(color: string): CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 5px, transparent 5px 11px)`,
  }
}

/** El descanso se raya con el color del horario que mas repite el colaborador. */
function rowStripeColor(row: EmployeeWeekRowWithAusencia) {
  const counts = new Map<number, number>()
  for (const day of row.days) {
    if (day.scheduleId != null) counts.set(day.scheduleId, (counts.get(day.scheduleId) ?? 0) + 1)
  }

  let dominant: number | null = null
  let dominantCount = 0
  for (const [scheduleId, count] of counts) {
    if (count > dominantCount) {
      dominant = scheduleId
      dominantCount = count
    }
  }

  return dominant == null
    ? NEUTRAL_STRIPE
    : SCHEDULE_PALETTE[dominant % SCHEDULE_PALETTE.length].stripe
}

function dayNumber(dateISO: string) {
  return Number(dateISO.slice(8, 10))
}

function shortMonth(date: Date) {
  return new Intl.DateTimeFormat('es-CR', { month: 'short' })
    .format(date)
    .replace('.', '')
    .toLowerCase()
}

/** "27 jul – 2 ago", o "6 – 12 oct" cuando la semana no cruza de mes. */
function formatWeekRange(startISO: string, endISO: string) {
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  const startMonth = shortMonth(start)
  const endMonth = shortMonth(end)

  return startMonth === endMonth
    ? `${start.getDate()} – ${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`
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

function timeRange(assignment: DayAssignmentWithAusencia) {
  const start = assignment.customStartTime ?? assignment.startTime
  const end = assignment.customEndTime ?? assignment.endTime
  if (!start || !end) return null
  return `${stripSeconds(start)} - ${stripSeconds(end)}`
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

interface ScheduleCellProps {
  row: EmployeeWeekRowWithAusencia
  assignment: DayAssignmentWithAusencia
  dayIndex: number
  stripe: string
  canWrite: boolean
  isSaving: boolean
  scheduleOptions: ScheduleRow[]
  currentValue: string
  onChange: (value: string) => void
  onEditCustom: () => void
}

/**
 * Celda de la matriz. El select nativo se superpone transparente sobre toda la
 * celda para que un clic en cualquier punto abra la lista de horarios sin
 * perder el teclado ni el nombre accesible del control.
 */
function ScheduleCell({
  row,
  assignment,
  dayIndex,
  stripe,
  canWrite,
  isSaving,
  scheduleOptions,
  currentValue,
  onChange,
  onEditCustom,
}: ScheduleCellProps) {
  const ausencia = assignment.ausencia
  const isBlocked = Boolean(ausencia && !ausencia.isIntraday)
  const isDisabled = !canWrite || isSaving || isBlocked
  const palette = paletteFor(assignment)
  const range = timeRange(assignment)

  const content = isBlocked ? (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center"
      style={{ backgroundColor: ABSENCE_PALETTE.fill, borderColor: ABSENCE_PALETTE.border }}
    >
      <HeartPulse className="h-3 w-3 shrink-0" style={{ color: ABSENCE_PALETTE.icon }} />
      <p
        className="line-clamp-2 text-[10.5px] font-semibold leading-[1.25]"
        style={{ color: ABSENCE_PALETTE.text }}
      >
        {ausencia!.tipoNombre}
      </p>
    </div>
  ) : assignment.isDayOff ? (
    <div className="flex-1 rounded-lg" style={hatchStyle(stripe)}>
      <span className="sr-only">Descanso</span>
    </div>
  ) : palette ? (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-px rounded-lg border px-1.5 py-1.5 text-center"
      style={{ backgroundColor: palette.fill, borderColor: palette.border }}
    >
      <p className="line-clamp-2 text-[11px] font-bold leading-[1.25] text-slate-800">
        {assignmentLabel(assignment)}
      </p>
      {range && (
        <p className="whitespace-nowrap text-[11px] leading-[1.3] tabular-nums text-slate-600">
          {range}
        </p>
      )}
      {(assignment.customStartTime || ausencia?.isIntraday || isSaving) && (
        <div className="mt-0.5 flex items-center gap-1">
          {assignment.customStartTime && canWrite && (
            <button
              type="button"
              onClick={onEditCustom}
              aria-label="Editar horas"
              className="pointer-events-auto rounded-full p-0.5 outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-violet-500/60"
            >
              <Pencil className="h-2.5 w-2.5 text-violet-500" />
            </button>
          )}
          {ausencia?.isIntraday && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-white/75 px-1.5 py-px text-[9px] font-bold"
              style={{ color: LACTANCIA_TEXT }}
            >
              <Baby className="h-2.5 w-2.5" /> Lactancia
            </span>
          )}
          {isSaving && <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-500" />}
        </div>
      )}
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center gap-1 rounded-lg">
      {canWrite ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white opacity-0 shadow-md transition group-hover/cell:opacity-100 peer-focus-visible:opacity-100">
          <Plus className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="text-[11px] text-slate-400">Sin asignar</span>
      )}
      {isSaving && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
    </div>
  )

  return (
    <div
      title={isBlocked ? ausencia!.tipoNombre : undefined}
      className="group/cell relative flex h-full min-h-[58px] flex-col"
    >
      {canWrite && (
        <select
          className={`peer absolute inset-0 z-0 h-full w-full appearance-none bg-transparent opacity-0 outline-none ${
            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
          value={currentValue}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Asignar horario para ${row.fullName} el ${WEEKDAY_NAMES[dayIndex]}`}
        >
          <AssignmentOptions scheduleOptions={scheduleOptions} />
        </select>
      )}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col">{content}</div>
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
  const [employeeFilter, setEmployeeFilter] = useState<'all' | number>('all')
  const [selectedDayIndexes, setSelectedDayIndexes] = useState<number[]>([])

  const branchOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of scheduleRows) {
      if (!map.has(row.branchId)) map.set(row.branchId, row.branchName ?? 'Sin sucursal')
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [scheduleRows])

  const branchFilteredRows = useMemo(
    () =>
      branchFilter === 'all'
        ? scheduleRows
        : scheduleRows.filter((row) => row.branchId === branchFilter),
    [scheduleRows, branchFilter]
  )

  // El selector de colaborador solo ofrece a quienes quedan tras el filtro de
  // sucursal, para que no se pueda armar una combinacion sin resultados.
  const employeeOptions = useMemo(
    () =>
      branchFilteredRows.map((row) => ({
        id: row.employmentHistoryId,
        name: row.fullName,
        position: row.position,
      })),
    [branchFilteredRows]
  )

  const filteredRows = useMemo(
    () =>
      employeeFilter === 'all'
        ? branchFilteredRows
        : branchFilteredRows.filter((row) => row.employmentHistoryId === employeeFilter),
    [branchFilteredRows, employeeFilter]
  )

  /** Cambiar de sucursal reinicia el colaborador: el anterior puede no pertenecer a ella. */
  function handleBranchChange(value: string) {
    setBranchFilter(value === 'all' ? 'all' : Number(value))
    setEmployeeFilter('all')
  }

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
  const todayISO = toISODate(new Date())

  return (
    <div className="min-w-0 space-y-3">
      <div className="@container relative z-30 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="mt-1 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              Matriz general de turnos por semana
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            {/*
              Flechas + rango + selector viven en una sola pieza: se lee como un
              unico control de semana en vez de tres pastillas sueltas.
            */}
            <div
              className="inline-flex items-center rounded-full border border-slate-200 p-0.5"
              style={{ backgroundColor: RAIL_BG }}
            >
              <IconButton
                onClick={() => goToWeekStart(shiftWeekISO(weekStartISO, -1))}
                disabled={isNavigating}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconButton>

              {/*
                Calendario propio, no `<input type="date">`: el nativo lo dibuja
                el navegador fuera del DOM, no acepta CSS y cambia de aspecto
                entre Chrome, Firefox y Safari — se veia de otro sistema al lado
                del resto de la barra. Ver DatePickerButton.tsx.
              */}
              <DatePopover
                value={weekStartISO}
                onChange={(picked) => goToWeekStart(getWeekDates(picked)[0])}
                disabled={isNavigating}
                label="Ir a una semana especifica"
                trigger={(props) => (
                  <button
                    {...props}
                    type="button"
                    aria-label="Ir a una semana especifica"
                    className="inline-flex min-w-[124px] items-center justify-center gap-1.5 rounded-full px-2 py-1 outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-400/50 disabled:cursor-not-allowed"
                  >
                    {isNavigating ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                    ) : (
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="text-xs font-bold text-slate-800">
                      {formatWeekRange(weekDates[0], weekDates[6])}
                    </span>
                  </button>
                )}
              />

              <IconButton
                onClick={() => goToWeekStart(shiftWeekISO(weekStartISO, 1))}
                disabled={isNavigating}
                aria-label="Semana siguiente"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
            </div>

            {/*
              Ya estando en la semana actual el boton no se apaga como si
              estuviera roto: pierde el borde y queda como una etiqueta discreta.
            */}
            <button
              type="button"
              onClick={() => goToWeekStart(currentMondayISO())}
              disabled={isNavigating || isCurrentWeek}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 outline-none transition hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/50 disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-slate-400"
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

        {/*
          Rediseño completo de esta barra: antes cada filtro era
          "Etiqueta: [caja]" en linea, que en movil forzaba a las cajas de
          ancho fijo (w-44/w-52) a su propia fila y se leia como una lista de
          formulario suelta, no como una barra de filtros. Ahora cada control
          lleva su etiqueta ARRIBA en mayusculas chicas (mismo patron que las
          tarjetas: META_LABEL), y los tres bloques se acomodan solos con
          `@container`: uno por fila en angosto, en linea desde @lg.
        */}
        <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3.5 @lg:grid-cols-[minmax(0,11rem)_minmax(0,13rem)_1fr] @lg:items-start">
          <label className="block">
            <span className={META_LABEL}>Sucursal</span>
            <SearchSelect
              ariaLabel="Filtrar por sucursal"
              className="mt-1 w-full"
              value={branchFilter === 'all' ? 'all' : String(branchFilter)}
              onChange={handleBranchChange}
              options={[
                { value: 'all', label: 'Todas las sucursales' },
                ...branchOptions.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
          </label>

          <label className="block">
            <span className={META_LABEL}>Colaborador</span>
            <SearchSelect
              ariaLabel="Filtrar por colaborador"
              className="mt-1 w-full"
              value={employeeFilter === 'all' ? 'all' : String(employeeFilter)}
              onChange={(v) => setEmployeeFilter(v === 'all' ? 'all' : Number(v))}
              options={[
                { value: 'all', label: 'Todos los colaboradores' },
                ...employeeOptions.map((e) => ({
                  value: String(e.id),
                  label: e.name,
                  sublabel: e.position ?? undefined,
                })),
              ]}
            />
          </label>

          <div>
            <span className={META_LABEL}>Días</span>
            {/*
              Grid de 7 columnas iguales, no flex-wrap: con flex-wrap, 7
              pildoras de ancho variable dejaban una sola huerfana en la
              segunda fila (el clasico "Dom" solo). Un grid parejo siempre
              cierra filas completas.
            */}
            <div className="mt-1 grid grid-cols-7 gap-1">
              {WEEKDAY_NAMES.map((name, index) => {
                const active = selectedDayIndexes.includes(index)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleDayIndex(index)}
                    aria-pressed={active}
                    className={`rounded-lg py-2 text-[10px] font-semibold outline-none transition active:scale-95 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-slate-400/50 pointer-coarse:min-h-11 ${
                      active
                        ? 'bg-slate-800 text-white'
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
      </div>

      {/*
        @container: sin esto los `@3xl:` de abajo (tarjetas en movil, tabla
        desde ahi) no tenian ancestro que declarar contenedor y NUNCA se
        activaban — ni la tabla de escritorio se mostraba ni las tarjetas se
        ocultaban en ancho grande. Bug propio, arreglado aca.
      */}
      <div className="@container overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="border-b border-slate-200/80 p-3 @3xl:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Vista móvil
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Desliza entre semanas arriba y edita cada día desde las tarjetas.
          </p>
        </div>

        <div className="space-y-2 p-2.5 @3xl:hidden">
          {filteredRows.length === 0 ? (
            <MatrixEmptyState hasUnfilteredRows={scheduleRows.length > 0} />
          ) : (
            paginatedRows.map((row) => {
              const stripe = rowStripeColor(row)

              return (
                <div
                  key={row.employmentHistoryId}
                  className="rounded-2xl border border-slate-200/80 bg-white p-3"
                >
                  <div className="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
                      {initialsOf(row.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{row.fullName}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="truncate">{row.position ?? 'Sin puesto asignado'}</span>
                        <span className="text-slate-300">|</span>
                        <span className="shrink-0 font-bold tabular-nums text-slate-600">
                          {formatHours(row.weeklyTotal)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visibleColumns.map(({ dateISO, index }) => {
                      const assignment = row.days[index]

                      return (
                        <div key={assignment.date} className="rounded-xl bg-slate-50/70 p-2">
                          <div className="mb-1.5 flex items-baseline justify-between px-0.5">
                            <p className="text-[11px] font-bold text-slate-700">
                              {WEEKDAY_NAMES[index].slice(0, 3)} {dayNumber(dateISO)}
                            </p>
                            <p className="text-[10px] font-semibold tabular-nums text-slate-400">
                              {assignment.hours > 0
                                ? `${formatHoursValue(assignment.hours)} h`
                                : '—'}
                            </p>
                          </div>
                          <ScheduleCell
                            row={row}
                            assignment={assignment}
                            dayIndex={index}
                            stripe={stripe}
                            canWrite={canWrite}
                            isSaving={
                              savingCell === `${row.employmentHistoryId}-${assignment.date}`
                            }
                            scheduleOptions={scheduleOptions}
                            currentValue={getAssignmentValue(assignment)}
                            onChange={(value) => handleAssignmentChange(row, assignment, value)}
                            onEditCustom={() => openCustomModal(row, assignment)}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between rounded-lg bg-slate-100/70 px-3 py-1.5 text-xs font-bold tabular-nums text-slate-900">
                    <span>Total semanal</span>
                    <span>{formatHours(row.weeklyTotal)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="hidden @3xl:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-20 w-[210px] min-w-[210px] border-b border-slate-200 px-3 py-2 text-left text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700"
                    style={{ backgroundColor: RAIL_BG }}
                  >
                    Colaborador
                  </th>
                  {visibleColumns.map(({ dateISO, index }) => (
                    <th
                      key={dateISO}
                      className="min-w-[84px] border-b border-slate-200 px-1.5 py-2 text-center"
                      style={{ backgroundColor: RAIL_BG }}
                    >
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11.5px] font-bold tabular-nums ${
                          dateISO === todayISO ? 'bg-slate-200/80 text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {WEEKDAY_NAMES[index].slice(0, 3)} {dayNumber(dateISO)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-4 py-10">
                      <MatrixEmptyState hasUnfilteredRows={scheduleRows.length > 0} />
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => {
                    const stripe = rowStripeColor(row)

                    return (
                      <tr key={row.employmentHistoryId} className="h-px">
                        <td
                          className="sticky left-0 z-10 h-full border-b border-slate-200/70 px-3 py-1.5"
                          style={{ backgroundColor: RAIL_BG }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9.5px] font-bold text-white ring-2 ring-white">
                              {initialsOf(row.fullName)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-bold text-slate-800">
                                {row.fullName}
                              </p>
                              <p className="mt-px flex items-center gap-1 text-[10px] text-slate-400">
                                <span className="truncate">
                                  {row.position ?? 'Sin puesto asignado'}
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="shrink-0 font-bold tabular-nums text-slate-950">
                                  {formatHours(row.weeklyTotal)}
                                </span>
                              </p>
                            </div>
                          </div>
                        </td>

                        {visibleColumns.map(({ index }) => {
                          const assignment = row.days[index]

                          return (
                            <td
                              key={assignment.date}
                              className="h-full border-b border-l border-slate-200/70 p-1"
                            >
                              <ScheduleCell
                                row={row}
                                assignment={assignment}
                                dayIndex={index}
                                stripe={stripe}
                                canWrite={canWrite}
                                isSaving={
                                  savingCell === `${row.employmentHistoryId}-${assignment.date}`
                                }
                                scheduleOptions={scheduleOptions}
                                currentValue={getAssignmentValue(assignment)}
                                onChange={(value) => handleAssignmentChange(row, assignment, value)}
                                onEditCustom={() => openCustomModal(row, assignment)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
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

function MatrixEmptyState({ hasUnfilteredRows = false }: { hasUnfilteredRows?: boolean }) {
  return (
    <EmptyState
      icon={Users}
      title={
        hasUnfilteredRows
          ? 'Ningún colaborador coincide con los filtros'
          : 'No hay colaboradores activos para esta semana'
      }
      description={
        hasUnfilteredRows
          ? 'Ajusta el filtro de sucursal o de días para ver resultados.'
          : 'Cuando el equipo tenga historial laboral activo, la matriz semanal aparecerá aquí.'
      }
      className="px-4 py-8"
    />
  )
}
