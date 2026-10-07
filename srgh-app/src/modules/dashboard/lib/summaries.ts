/**
 * Turns what each module already knows how to load into the few numbers the
 * dashboard shows. Pure functions over those modules' own result types: the
 * dashboard adds no queries and no rules of its own — if Attendance says
 * someone was late, they are late here too.
 */

import type { DailyAttendanceRow } from '@/modules/attendance/actions/getDailyAttendance'
import type { MonthlyEmployeeSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { classifyTardiness, type TardinessType } from '@/modules/attendance/lib/infractions'
import { diffMinutes } from '@/modules/attendance/lib/time'
import type { PeriodoListItem } from '@/modules/payroll/types'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'

/* --------------------------------------------------------------- attendance */

/** A tardiness type of the company's catalog, as the panel paints it. */
export interface TardinessTag {
  nombre: string
  color: string | null
}

interface Person {
  id: number
  nombre: string
  fotoUrl: string | null
}

export interface AttendanceSummary {
  /** People with a shift today (days off and holidays are left out). */
  expected: number
  onTime: number
  /** Clocked in late, by the company's own tardiness catalog. */
  late: number
  /** No entry mark yet, and still within their time: not late so far. */
  pending: number
  /** No entry mark, and already past the first tardiness threshold. */
  missing: number
  /** Covered by an approved absence. */
  justified: number
  /** Clocked in and not out yet. */
  working: number
  /** Already clocked out. */
  left: number
  latePeople: (Person & { minutes: number; tipo: TardinessTag; isJustified: boolean })[]
  /** `tipo` is the tardiness they are in right now, were they to arrive. */
  missingPeople: (Person & { minutes: number; tipo: TardinessTag; expectedStart: string })[]
  pendingPeople: (Person & { expectedStart: string })[]
}

/**
 * Splits today's shift by what happened to each person so far.
 *
 * Tardiness is never decided here: someone who clocked in carries the type
 * Attendance already gave them (`row.tardiness`), and someone who has not is
 * measured against the SAME catalog (`tipos`, configured per company) with
 * the current time. That is what keeps a person whose shift has not started,
 * or who is two minutes inside the tolerance, from being reported as absent.
 *
 * `nowTime` is the Costa Rica wall clock, "HH:mm".
 */
export function summarizeAttendance(
  rows: DailyAttendanceRow[],
  nowTime: string,
  tipos: TardinessType[]
): AttendanceSummary {
  const summary: AttendanceSummary = {
    expected: 0,
    onTime: 0,
    late: 0,
    pending: 0,
    missing: 0,
    justified: 0,
    working: 0,
    left: 0,
    latePeople: [],
    missingPeople: [],
    pendingPeople: [],
  }

  for (const row of rows) {
    if (row.isDayOff || row.isHoliday) continue
    /* No schedule, no absence and no mark: nothing was expected of them. */
    if (!row.expectedStart && !row.ausencia && !row.entrada) continue

    summary.expected += 1
    const person = { id: row.employeeId, nombre: row.fullName, fotoUrl: row.fotoUrl }

    if (row.entrada) {
      if (row.tardiness) {
        summary.late += 1
        summary.latePeople.push({
          ...person,
          minutes: row.tardiness.diffMinutes,
          tipo: row.tardiness.tipo,
          isJustified: row.tardiness.isJustified,
        })
      } else {
        summary.onTime += 1
      }
      if (row.salida) summary.left += 1
      else summary.working += 1
      continue
    }

    if (row.ausencia || !row.expectedStart) {
      summary.justified += 1
      continue
    }

    const minutes = diffMinutes(nowTime, row.expectedStart)
    const tipo = classifyTardiness(minutes, tipos)

    if (tipo) {
      summary.missing += 1
      summary.missingPeople.push({
        ...person,
        minutes,
        tipo: { nombre: tipo.nombre, color: tipo.color },
        expectedStart: row.expectedStart,
      })
    } else {
      summary.pending += 1
      summary.pendingPeople.push({ ...person, expectedStart: row.expectedStart })
    }
  }

  summary.latePeople.sort((a, b) => b.minutes - a.minutes)
  summary.missingPeople.sort((a, b) => b.minutes - a.minutes)
  summary.pendingPeople.sort((a, b) => a.expectedStart.localeCompare(b.expectedStart))
  return summary
}

/* -------------------------------------------------------------------- month */

export interface MonthSummary {
  /** Tardiness that counts toward the warning, across everyone. */
  tardias: number
  /** Shift days with no mark and no approved absence. */
  ausencias: number
  /** Who accumulates the most, worst first. Only people with something. */
  people: { id: number; nombre: string; tardias: number; ausencias: number }[]
}

const MONTH_PEOPLE_SHOWN = 5

/**
 * The month so far, from the same report the Attendance module shows: its
 * counts are taken as they come (what counts as a tardiness, and whether a
 * justified one adds up, is decided there and by the company's catalog).
 */
export function summarizeMonth(rows: MonthlyEmployeeSummary[]): MonthSummary {
  const withSomething = rows.filter((row) => row.tardias > 0 || row.ausencias > 0)

  return {
    tardias: rows.reduce((sum, row) => sum + row.tardias, 0),
    ausencias: rows.reduce((sum, row) => sum + row.ausencias, 0),
    people: withSomething
      .sort(
        (a, b) =>
          b.tardias + b.ausencias - (a.tardias + a.ausencias) ||
          a.fullName.localeCompare(b.fullName)
      )
      .slice(0, MONTH_PEOPLE_SHOWN)
      .map((row) => ({
        id: row.employeeId,
        nombre: row.fullName,
        tardias: row.tardias,
        ausencias: row.ausencias,
      })),
  }
}

/* ------------------------------------------------------------------ payroll */

export interface PayrollSummary {
  /** Periods not paid yet. */
  pending: number
  /** Of those, the ones whose period already ended. */
  overdue: number
  /** The period today falls in; failing that, the latest unpaid one. */
  current: {
    id: number
    mes: number
    anio: number
    quincena: number
    estado: string
    atrasado: boolean
    fechaPago: string | null
    sucursal: string
    totalEmpleados: number
    /** 1-based day of the period today is, and its length; null outside it. */
    day: number | null
    totalDays: number | null
  } | null
  /** The other unpaid periods, latest first (a few: the rest is in Payroll). */
  others: { id: number; mes: number; anio: number; quincena: number; atrasado: boolean }[]
}

const OTHER_PERIODS_SHOWN = 3

const MS_PER_DAY = 86_400_000

function isoToMs(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`)
}

export function summarizePayroll(periodos: PeriodoListItem[], todayIso: string): PayrollSummary {
  const unpaid = periodos.filter((periodo) => periodo.estado !== 'pagado')
  const running = periodos.find(
    (periodo) =>
      periodo.fechaInicio !== null &&
      periodo.fechaFin !== null &&
      periodo.fechaInicio <= todayIso &&
      todayIso <= periodo.fechaFin
  )
  const current = running ?? unpaid[0] ?? null

  let day: number | null = null
  let totalDays: number | null = null
  if (running?.fechaInicio && running.fechaFin) {
    day = Math.round((isoToMs(todayIso) - isoToMs(running.fechaInicio)) / MS_PER_DAY) + 1
    totalDays =
      Math.round((isoToMs(running.fechaFin) - isoToMs(running.fechaInicio)) / MS_PER_DAY) + 1
  }

  return {
    pending: unpaid.length,
    overdue: unpaid.filter((periodo) => periodo.atrasado).length,
    others: unpaid
      .filter((periodo) => periodo.id !== current?.id)
      .slice(0, OTHER_PERIODS_SHOWN)
      .map(({ id, mes, anio, quincena, atrasado }) => ({ id, mes, anio, quincena, atrasado })),
    current: current && {
      id: current.id,
      mes: current.mes,
      anio: current.anio,
      quincena: current.quincena,
      estado: current.estado,
      atrasado: current.atrasado,
      fechaPago: current.fechaPago,
      sucursal: current.sucursalNombre,
      totalEmpleados: current.totalEmpleados,
      day,
      totalDays,
    },
  }
}

/* -------------------------------------------------------------- recruitment */

export interface RecruitmentSummary {
  /** Applications still in process. */
  total: number
  phases: { id: 1 | 2 | 3; label: string; count: number }[]
  /** Latest to apply, newest first. */
  newest: { id: number; nombre: string; puesto: string }[]
}

/* Same three columns as the recruitment board. */
const PHASE_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Postulados',
  2: 'En evaluación',
  3: 'Decisión',
}

const NEWEST_SHOWN = 3

export function summarizeRecruitment(items: PostulacionBoardItem[]): RecruitmentSummary {
  const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  for (const item of items) counts[item.etapaFase] += 1

  const newest = [...items]
    .sort((a, b) => b.fechaPostula.localeCompare(a.fechaPostula))
    .slice(0, NEWEST_SHOWN)
    .map((item) => ({ id: item.posId, nombre: item.candidatoNombre, puesto: item.puestoNombre }))

  return {
    total: items.length,
    phases: ([1, 2, 3] as const).map((id) => ({ id, label: PHASE_LABELS[id], count: counts[id] })),
    newest,
  }
}
