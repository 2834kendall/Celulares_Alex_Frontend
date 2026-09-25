'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Baby,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import type { EmployeeWeekRow, SucursalOption } from '@/modules/schedules/actions/getWeeklySchedule'
import { getScheduleSuggestion } from '@/modules/schedules/actions/getScheduleSuggestion'
import { pasteWeeklySchedule } from '@/modules/schedules/actions/pasteWeeklySchedule'
import type { PasteWeeklyScheduleInput, ScheduleRow } from '@/modules/schedules/types'
import {
  WEEKDAY_NAMES,
  currentMondayISO,
  getWeekDates,
  shiftWeekISO,
  toISODate,
} from '@/modules/schedules/lib/week'
import { stripSeconds } from '@/modules/schedules/lib/time'
import {
  NEUTRAL_STRIPE,
  SCHEDULE_PALETTE,
  customSchedulePalette,
  hatchStyle,
  paletteForSchedule,
  type CellPalette,
} from '@/modules/schedules/lib/cellPalette'
import { useWeekNavigation } from '@/modules/schedules/hooks/useWeekNavigation'
import {
  useWeeklyScheduleMatrix,
  type DayAssignmentWithAusencia,
  type EmployeeWeekRowWithAusencia,
} from '@/modules/schedules/hooks/useWeeklyScheduleMatrix'
import { usePagination } from '@/hooks/usePagination'
import { Avatar } from '@/components/ui/Avatar'
import { formatHoursValue } from '@/modules/schedules/lib/hours'
import { Pagination } from '@/components/ui/Pagination'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { META_LABEL } from '@/components/ui/styles'
import { CustomHoursModal } from '@/modules/schedules/components/CustomHoursModal'
import type { AusenciaOverlayEntry } from '@/modules/absences/lib/overlay'
import { IconButton } from '@/components/ui/IconButton'
import { DatePopover } from '@/components/ui/DatePickerButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useFormatHora } from '@/lib/time/FormatoHoraContext'

type PasteEmployeeInput = PasteWeeklyScheduleInput['employees'][number]
type PasteDayInput = PasteEmployeeInput['days'][number]

interface ClipboardDay {
  scheduleId: number | null
  isDayOff: boolean
  customStartTime: string | null
  customEndTime: string | null
  customLunchStart: string | null
  customLunchEnd: string | null
  customBreakStart: string | null
  customBreakEnd: string | null
  // Sucursal real del dia copiado, para que "pegar" respete la rotacion.
  branchId: number
}

interface ScheduleClipboard {
  sourceWeekStartISO: string
  byEmployment: Record<number, ClipboardDay[]>
}

// Forma minima que necesita applySource; branchId es opcional porque la
// sugerencia no opina de sucursal (cae a la de casa del destino).
interface SourceDay {
  scheduleId: number | null
  isDayOff: boolean
  branchId?: number
  customStartTime?: string | null
  customEndTime?: string | null
  customLunchStart?: string | null
  customLunchEnd?: string | null
  customBreakStart?: string | null
  customBreakEnd?: string | null
}

const CLIPBOARD_STORAGE_KEY = 'sgrh_schedule_week_clipboard'

function loadClipboard(): ScheduleClipboard | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ScheduleClipboard> | null
    if (!parsed || typeof parsed.sourceWeekStartISO !== 'string' || !parsed.byEmployment) {
      return null
    }
    return parsed as ScheduleClipboard
  } catch {
    return null
  }
}

function saveClipboard(clipboard: ScheduleClipboard) {
  try {
    window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(clipboard))
  } catch {
    // Modo privado o cuota llena: perder el portapapeles no debe romper la matriz.
  }
}

interface WeeklyScheduleMatrixProps {
  weekStartISO: string
  weekDates: string[]
  rows: EmployeeWeekRow[]
  sucursales: SucursalOption[]
  schedules: ScheduleRow[]
  canWrite: boolean
  ausencias?: AusenciaOverlayEntry[]
}

/** Neutro frio de la cabecera y del riel fijo de colaboradores. */
const RAIL_BG = '#F7F8FA'

/**
 * Ausencias en rosa palo apagado: mismo nivel de luminosidad que el resto de
 * la paleta, sin el rojo de alerta que competia con los horarios.
 */
const ABSENCE_PALETTE = { fill: '#F8EBEF', border: '#E6CDD5', text: '#856874', icon: '#BC9BA6' }
const LACTANCIA_TEXT = '#8B6A7C'

function paletteFor(
  assignment: DayAssignmentWithAusencia,
  colorById: Map<number, string>
): CellPalette | null {
  return paletteForSchedule({
    scheduleId: assignment.scheduleId,
    isCustom: Boolean(assignment.customStartTime),
    manualColor: assignment.scheduleId != null ? colorById.get(assignment.scheduleId) : null,
  })
}

/** El descanso se raya con el color del horario que mas repite el colaborador. */
function rowStripeColor(row: EmployeeWeekRowWithAusencia, colorById: Map<number, string>) {
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

  if (dominant == null) return NEUTRAL_STRIPE
  const manualColor = colorById.get(dominant)
  if (manualColor) return customSchedulePalette(manualColor).stripe
  return SCHEDULE_PALETTE[dominant % SCHEDULE_PALETTE.length].stripe
}

// Un dia bloqueado por ausencia no cuenta como hueco: sin horario = no puede marcar.
function hasScheduleGap(row: EmployeeWeekRowWithAusencia): boolean {
  return row.days.some((day) => {
    const isBlocked = Boolean(day.ausencia && !day.ausencia.isIntraday)
    return day.assignmentId === null && !isBlocked
  })
}

// Insignia junto al nombre cuando el colaborador tiene algun dia sin horario.
function GapIndicator() {
  return (
    <span title="Tiene días sin horario asignado esta semana" className="shrink-0">
      <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden="true" />
    </span>
  )
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
function formatHours(hours: number) {
  return `${formatHoursValue(hours)} Hrs`
}

function assignmentLabel(assignment: DayAssignmentWithAusencia) {
  if (assignment.isDayOff) return 'Descanso'
  if (assignment.customStartTime) return 'Personalizado'
  return assignment.scheduleName ?? 'Sin asignar'
}

/**
 * Rango del turno para PINTAR en la celda. Recibe el formateador de la
 * empresa (12h/24h) en vez de usar stripSeconds: stripSeconds devuelve el
 * "HH:MM" que exigen los inputs del modal de horas personalizadas (más
 * abajo, initialStartTime & co.) y eso tiene que seguir en 24h.
 */
function timeRange(
  assignment: DayAssignmentWithAusencia,
  rango: (inicio: string | null | undefined, fin: string | null | undefined) => string | null
) {
  const start = assignment.customStartTime ?? assignment.startTime
  const end = assignment.customEndTime ?? assignment.endTime
  return rango(start, end)
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
  sucursales: SucursalOption[]
  currentValue: string
  colorById: Map<number, string>
  onChange: (value: string) => void
  onEditCustom: () => void
  onBranchChange: (branchId: number) => void
}

// Franja al pie de la celda para ver/cambiar la sucursal de ese dia (select transparente superpuesto).
function BranchBar({
  assignment,
  employeeName,
  dayLabel,
  sucursales,
  canWrite,
  isSaving,
  borderColor,
  onBranchChange,
}: {
  assignment: DayAssignmentWithAusencia
  employeeName: string
  dayLabel: string
  sucursales: SucursalOption[]
  canWrite: boolean
  isSaving: boolean
  // Mismo tono que el borde de la tarjeta, para que la franja no se vea gris ajena.
  borderColor: string
  onBranchChange: (branchId: number) => void
}) {
  if (!canWrite || !assignment.assignmentId || sucursales.length < 2) {
    return null
  }

  return (
    <div
      className="pointer-events-auto relative flex shrink-0 items-center justify-center gap-1 px-1.5 py-1"
      style={{ borderTop: `1px solid ${borderColor}` }}
      title={assignment.branchName ?? undefined}
    >
      <Building2 className="h-2.5 w-2.5 shrink-0 text-slate-500" />
      <span className="min-w-0 truncate text-[9.5px] font-semibold leading-none text-slate-600">
        {assignment.branchName ?? 'Sin sucursal'}
      </span>
      <select
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none disabled:cursor-not-allowed"
        value={assignment.branchId}
        disabled={isSaving}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onBranchChange(Number(event.target.value))}
        aria-label={`Sucursal de ${employeeName} el ${dayLabel}`}
      >
        {sucursales.map((sucursal) => (
          <option key={sucursal.id} value={sucursal.id}>
            {sucursal.nombre}
          </option>
        ))}
      </select>
    </div>
  )
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
  sucursales,
  currentValue,
  colorById,
  onChange,
  onEditCustom,
  onBranchChange,
}: ScheduleCellProps) {
  const ausencia = assignment.ausencia
  const isBlocked = Boolean(ausencia && !ausencia.isIntraday)
  const isDisabled = !canWrite || isSaving || isBlocked
  const palette = paletteFor(assignment, colorById)
  const { rango } = useFormatHora()
  const range = timeRange(assignment, rango)

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
      className="flex flex-1 flex-col overflow-hidden rounded-lg border text-center"
      style={{ backgroundColor: palette.fill, borderColor: palette.border }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-px px-1.5 py-1.5">
        <p className="line-clamp-2 text-[11px] font-bold leading-[1.25] text-slate-800">
          {assignmentLabel(assignment)}
        </p>
        {range && (
          // Sin whitespace-nowrap: en 12h el rango casi duplica su largo y
          // la celda (una de 7 por fila) no lo contenía. En 24h sigue
          // entrando en una línea. Mismo criterio que MyScheduleView.
          <p className="text-[11px] leading-[1.3] tabular-nums text-slate-600">{range}</p>
        )}
        {(assignment.customStartTime || ausencia?.isIntraday || isSaving) && (
          <div className="mt-0.5 flex items-center gap-1">
            {assignment.customStartTime && canWrite && (
              <button
                type="button"
                onClick={onEditCustom}
                aria-label="Editar horas"
                className="pointer-events-auto rounded-full p-0.5 outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <Pencil className="h-2.5 w-2.5 text-brand-600" />
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
      <BranchBar
        assignment={assignment}
        employeeName={row.fullName}
        dayLabel={WEEKDAY_NAMES[dayIndex]}
        sucursales={sucursales}
        canWrite={canWrite}
        isSaving={isSaving}
        borderColor={palette.border}
        onBranchChange={onBranchChange}
      />
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center gap-1 rounded-lg">
      {canWrite ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white opacity-0 shadow-md transition group-hover/cell:opacity-100 peer-focus-visible:opacity-100">
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
  sucursales,
  schedules,
  canWrite,
  ausencias,
}: WeeklyScheduleMatrixProps) {
  const { isNavigating, goToWeekStart } = useWeekNavigation(weekStartISO)

  const colorById = useMemo(() => {
    const map = new Map<number, string>()
    for (const schedule of schedules) {
      if (schedule.hor_color) map.set(schedule.hor_id, schedule.hor_color)
    }
    return map
  }, [schedules])

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
    handleBranchChange,
  } = useWeeklyScheduleMatrix({ rows, schedules, canWrite, ausencias })

  const [branchFilter, setBranchFilter] = useState<'all' | number>('all')
  const [employeeFilter, setEmployeeFilter] = useState<'all' | number>('all')
  const [selectedDayIndexes, setSelectedDayIndexes] = useState<number[]>([])
  const [clipboard, setClipboard] = useState<ScheduleClipboard | null>(() => loadClipboard())
  const [isPasting, setIsPasting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

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

  const employeeAndBranchFilteredRows = useMemo(
    () =>
      employeeFilter === 'all'
        ? branchFilteredRows
        : branchFilteredRows.filter((row) => row.employmentHistoryId === employeeFilter),
    [branchFilteredRows, employeeFilter]
  )

  // Colaboradores con algun dia sin horario, tras los filtros de sucursal/colaborador.
  const employeesWithGaps = useMemo(
    () => employeeAndBranchFilteredRows.filter(hasScheduleGap),
    [employeeAndBranchFilteredRows]
  )

  const gapNamesPreview = useMemo(() => {
    const names = employeesWithGaps.map((row) => row.fullName)
    return names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`
  }, [employeesWithGaps])

  const [showOnlyGaps, setShowOnlyGaps] = useState(false)
  const [gapAlertDismissed, setGapAlertDismissed] = useState(false)

  // Resetea el filtro/descarte al cambiar de semana (ajuste en render, no efecto).
  const [prevWeekStartISO, setPrevWeekStartISO] = useState(weekStartISO)
  if (weekStartISO !== prevWeekStartISO) {
    setPrevWeekStartISO(weekStartISO)
    setShowOnlyGaps(false)
    setGapAlertDismissed(false)
  }

  // Se apaga solo si ya no quedan huecos, para no mostrar una lista vacia.
  const isShowingOnlyGaps = showOnlyGaps && employeesWithGaps.length > 0

  const filteredRows = isShowingOnlyGaps ? employeesWithGaps : employeeAndBranchFilteredRows

  function dismissGapAlert() {
    setShowOnlyGaps(false)
    setGapAlertDismissed(true)
  }

  // Cambiar de sucursal reinicia el colaborador seleccionado.
  function handleBranchFilterChange(value: string) {
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
  } = usePagination(filteredRows, 10)

  const isCurrentWeek = weekStartISO === currentMondayISO()
  const todayISO = toISODate(new Date())

  /** Copia el horario de la semana que se esta viendo (respeta filtro de sucursal/colaborador). */
  function handleCopyWeek() {
    if (filteredRows.length === 0) {
      toast.error('No hay colaboradores para copiar en esta vista.')
      return
    }

    const byEmployment: Record<number, ClipboardDay[]> = {}
    for (const row of filteredRows) {
      byEmployment[row.employmentHistoryId] = row.days.map((day) => ({
        scheduleId: day.scheduleId,
        isDayOff: day.isDayOff,
        customStartTime: day.customStartTime ?? null,
        customEndTime: day.customEndTime ?? null,
        customLunchStart: day.customLunchStart ?? null,
        customLunchEnd: day.customLunchEnd ?? null,
        customBreakStart: day.customBreakStart ?? null,
        customBreakEnd: day.customBreakEnd ?? null,
        branchId: day.branchId,
      }))
    }

    const next: ScheduleClipboard = { sourceWeekStartISO: weekStartISO, byEmployment }
    setClipboard(next)
    saveClipboard(next)
    toast.success(
      `Semana copiada (${filteredRows.length} colaborador${filteredRows.length === 1 ? '' : 'es'}).`
    )
  }

  /**
   * Arma, para cada colaborador visible, los dias a escribir a partir de una
   * fuente por colaborador+dia-de-semana (lo copiado, o lo sugerido) —
   * saltando los dias bloqueados por ausencia y los colaboradores sin fuente,
   * y los pasa a `pasteWeeklySchedule` en una sola llamada.
   */
  async function applySource(
    sourceByEmployment: Record<number, (SourceDay | null)[] | undefined>,
    noSourceMessage: string,
    successMessage: string
  ) {
    const employees: PasteEmployeeInput[] = []

    for (const row of filteredRows) {
      const source = sourceByEmployment[row.employmentHistoryId]
      if (!source) continue

      const days: PasteDayInput[] = []
      for (let i = 0; i < 7; i++) {
        const sourceDay = source[i]
        if (!sourceDay) continue

        const destDay = row.days[i]
        const isBlocked = Boolean(destDay.ausencia && !destDay.ausencia.isIntraday)
        if (isBlocked) continue

        days.push({
          assignmentId: destDay.assignmentId,
          date: destDay.date,
          // La sugerencia no opina de sucursal: cae a la de casa del destino.
          branchId: sourceDay.branchId ?? row.branchId,
          scheduleId: sourceDay.scheduleId,
          isDayOff: sourceDay.isDayOff,
          customStartTime: sourceDay.customStartTime ?? null,
          customEndTime: sourceDay.customEndTime ?? null,
          customLunchStart: sourceDay.customLunchStart ?? null,
          customLunchEnd: sourceDay.customLunchEnd ?? null,
          customBreakStart: sourceDay.customBreakStart ?? null,
          customBreakEnd: sourceDay.customBreakEnd ?? null,
        })
      }

      if (days.length > 0) {
        employees.push({
          employmentHistoryId: row.employmentHistoryId,
          employeeId: row.employeeId,
          days,
        })
      }
    }

    if (employees.length === 0) {
      toast.error(noSourceMessage)
      return false
    }

    const result = await pasteWeeklySchedule({ employees })

    if (!result.ok) {
      toast.error(result.error)
      return false
    }

    toast.success(successMessage)
    return true
  }

  /** Pega en la semana visible lo copiado de otra (o de la misma) semana. */
  async function handlePasteWeek() {
    if (!canWrite || isPasting) return

    if (!clipboard) {
      toast.error('No hay ningun horario copiado.')
      return
    }

    setIsPasting(true)
    await applySource(
      clipboard.byEmployment,
      'No hay dias disponibles para pegar en esta vista.',
      'Horario pegado.'
    )
    setIsPasting(false)
  }

  /** Sugiere, por colaborador y dia, el turno que mas se repite en su historial previo a esta semana. */
  async function handleGenerateSuggestion() {
    if (!canWrite || isGenerating) return

    if (filteredRows.length === 0) {
      toast.error('No hay colaboradores para generar un horario.')
      return
    }

    setIsGenerating(true)

    const result = await getScheduleSuggestion(
      filteredRows.map((row) => row.employmentHistoryId),
      weekStartISO
    )

    if (!result.ok) {
      toast.error(result.error)
      setIsGenerating(false)
      return
    }

    await applySource(
      result.byEmployment,
      'No hay suficiente historial para sugerir un horario.',
      'Horario sugerido aplicado.'
    )
    setIsGenerating(false)
  }

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

            {canWrite && (
              <div
                className="inline-flex items-center rounded-full border border-slate-200 p-0.5"
                style={{ backgroundColor: RAIL_BG }}
              >
                <IconButton
                  onClick={handleCopyWeek}
                  aria-label="Copiar el horario de esta vista"
                  title="Copiar horario"
                >
                  <Copy className="h-3.5 w-3.5" />
                </IconButton>

                <IconButton
                  onClick={handlePasteWeek}
                  disabled={!clipboard || isPasting}
                  aria-label="Pegar el horario copiado en esta vista"
                  title={
                    clipboard
                      ? 'Pegar horario copiado'
                      : 'Copia un horario primero para poder pegarlo'
                  }
                >
                  {isPasting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ClipboardPaste className="h-3.5 w-3.5" />
                  )}
                </IconButton>

                <IconButton
                  onClick={handleGenerateSuggestion}
                  disabled={isGenerating}
                  aria-label="Generar horario sugerido segun el historial"
                  title="Generar horario sugerido segun el historial"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                </IconButton>
              </div>
            )}

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

        {employeesWithGaps.length > 0 && !gapAlertDismissed && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <button
              type="button"
              onClick={() => setShowOnlyGaps((prev) => !prev)}
              className="flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
            >
              <span className="font-semibold underline decoration-amber-400 decoration-dotted underline-offset-2">
                {employeesWithGaps.length} colaborador{employeesWithGaps.length === 1 ? '' : 'es'}{' '}
                sin horario asignado esta semana
              </span>
              {isShowingOnlyGaps ? (
                <> — mostrando solo a ellos, clic para ver a todos otra vez.</>
              ) : (
                <>
                  : no podrán marcar asistencia esos días ({gapNamesPreview}). Clic para filtrar la
                  lista.
                </>
              )}
            </button>
            <button
              type="button"
              onClick={dismissGapAlert}
              aria-label="Descartar este aviso"
              title="Ya lo vi, no avisar más esta semana"
              className="shrink-0 rounded-full p-0.5 text-amber-600 outline-none transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
              onChange={handleBranchFilterChange}
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
                    className={`rounded-lg py-2 text-[10px] font-semibold outline-none transition active:scale-95 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60 pointer-coarse:min-h-11 ${
                      active
                        ? 'bg-brand-700 text-white'
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
              const stripe = rowStripeColor(row, colorById)

              return (
                <div
                  key={row.employmentHistoryId}
                  className="rounded-2xl border border-slate-200/80 bg-white p-3"
                >
                  <div className="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
                    <Avatar size="md" fotoUrl={row.fotoUrl} nombre={row.fullName} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate text-sm font-bold text-slate-800">
                        <span className="truncate">{row.fullName}</span>
                        {hasScheduleGap(row) && <GapIndicator />}
                      </p>
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
                            sucursales={sucursales}
                            currentValue={getAssignmentValue(assignment)}
                            colorById={colorById}
                            onChange={(value) => handleAssignmentChange(row, assignment, value)}
                            onEditCustom={() => openCustomModal(row, assignment)}
                            onBranchChange={(branchId) =>
                              handleBranchChange(row, assignment, branchId)
                            }
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
                    const stripe = rowStripeColor(row, colorById)

                    return (
                      <tr key={row.employmentHistoryId} className="h-px">
                        <td
                          className="sticky left-0 z-10 h-full border-b border-slate-200/70 px-3 py-1.5"
                          style={{ backgroundColor: RAIL_BG }}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar
                              size="xs"
                              fotoUrl={row.fotoUrl}
                              nombre={row.fullName}
                              className="ring-2 ring-white"
                            />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1 truncate text-[12px] font-bold text-slate-800">
                                <span className="truncate">{row.fullName}</span>
                                {hasScheduleGap(row) && <GapIndicator />}
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
                                sucursales={sucursales}
                                currentValue={getAssignmentValue(assignment)}
                                colorById={colorById}
                                onChange={(value) => handleAssignmentChange(row, assignment, value)}
                                onEditCustom={() => openCustomModal(row, assignment)}
                                onBranchChange={(branchId) =>
                                  handleBranchChange(row, assignment, branchId)
                                }
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
            sucursales={sucursales}
            initialBranchId={customModalFor.assignment.branchId}
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
