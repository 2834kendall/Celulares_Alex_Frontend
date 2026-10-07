/**
 * Pure shaping for the optional dashboard panels whose data the dashboard
 * loads itself (see actions/getDashboardExtras): absences of the week,
 * evaluations of the year, contracts about to end, and the reader's own
 * marks of the day. Dates are plain "YYYY-MM-DD" strings compared as text or
 * through UTC, never the local clock, so results do not depend on where the
 * server runs.
 */

import type { MyAttendanceDay } from '@/modules/attendance/actions/getMyMarks'
import { MONTHS_SHORT } from '@/modules/dashboard/lib/birthdays'

const MS_PER_DAY = 86_400_000

function isoToMs(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`)
}

function shortDate(iso: string) {
  const [, month, day] = iso.split('-').map(Number)
  return `${day} ${MONTHS_SHORT[month - 1]}`
}

/** "7 oct", "7–9 oct" or "30 sep – 2 oct". */
export function rangeLabel(fromIso: string, toIso: string) {
  if (fromIso === toIso) return shortDate(fromIso)
  const sameMonth = fromIso.slice(0, 7) === toIso.slice(0, 7)
  return sameMonth
    ? `${Number(fromIso.slice(8))}–${shortDate(toIso)}`
    : `${shortDate(fromIso)} – ${shortDate(toIso)}`
}

/** A person as these panels list them: by contract, with where they work. */
export interface RosterPerson {
  /** Employment history id: what absences and evaluations point at. */
  labId: number
  employeeId: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  /** Scheduled end of the contract, when it has one. */
  fechaFinProgramada: string | null
}

/* ----------------------------------------------------------------- absences */

export interface AbsenceSource {
  id: number
  labId: number
  fechaInicio: string
  fechaFin: string
  tipo: string
  /** Covers part of the day only (lactancia): the person still works. */
  esIntradia: boolean
}

export interface AbsencesSummary {
  /** People with a full-day absence that covers today. */
  outToday: number
  absences: {
    id: number
    employeeId: number
    nombre: string
    tipo: string
    range: string
    coversToday: boolean
    esIntradia: boolean
  }[]
}

/**
 * Approved absences that touch the week, the ones in force today first.
 * An absence of someone no longer on the roster is dropped: there is nobody
 * to show it for.
 */
export function summarizeAbsences(
  absences: AbsenceSource[],
  roster: Map<number, RosterPerson>,
  todayIso: string
): AbsencesSummary {
  const rows = absences.flatMap((absence) => {
    const person = roster.get(absence.labId)
    if (!person) return []

    return [
      {
        id: absence.id,
        employeeId: person.employeeId,
        nombre: person.nombre,
        tipo: absence.tipo,
        range: rangeLabel(absence.fechaInicio, absence.fechaFin),
        coversToday: absence.fechaInicio <= todayIso && todayIso <= absence.fechaFin,
        esIntradia: absence.esIntradia,
        start: absence.fechaInicio,
      },
    ]
  })

  rows.sort(
    (a, b) =>
      Number(b.coversToday) - Number(a.coversToday) ||
      a.start.localeCompare(b.start) ||
      a.nombre.localeCompare(b.nombre)
  )

  const outToday = new Set(
    rows.filter((row) => row.coversToday && !row.esIntradia).map((row) => row.employeeId)
  ).size

  return {
    outToday,
    absences: rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      nombre: row.nombre,
      tipo: row.tipo,
      range: row.range,
      coversToday: row.coversToday,
      esIntradia: row.esIntradia,
    })),
  }
}

/* -------------------------------------------------------------- evaluations */

export interface EvaluationSource {
  id: number
  labId: number | null
  fecha: string
  /** 1–10, null when the evaluation has no final average. */
  promedio: number | null
}

export interface EvaluationsSummary {
  year: number
  /** People on the roster with at least one evaluation this year. */
  evaluated: number
  /** People on the roster with none yet this year. */
  pending: number
  /** Mean of each person's latest evaluation, one decimal. null with none. */
  average: number | null
  recent: { id: number; nombre: string; promedio: number | null; fecha: string }[]
  pendingNames: string[]
}

const RECENT_EVALUATIONS = 4
const PENDING_NAMES = 4

/**
 * How the year's evaluations are going. `evaluations` must come newest
 * first: the first one found for a person is their latest.
 */
export function summarizeEvaluations(
  evaluations: EvaluationSource[],
  roster: Map<number, RosterPerson>,
  year: number
): EvaluationsSummary {
  const latest = new Map<number, EvaluationSource>()
  const recent: EvaluationsSummary['recent'] = []

  for (const evaluation of evaluations) {
    if (evaluation.labId === null) continue
    const person = roster.get(evaluation.labId)
    if (!person) continue

    if (!latest.has(evaluation.labId)) latest.set(evaluation.labId, evaluation)
    if (recent.length < RECENT_EVALUATIONS) {
      recent.push({
        id: evaluation.id,
        nombre: person.nombre,
        promedio: evaluation.promedio === null ? null : Math.round(evaluation.promedio),
        fecha: shortDate(evaluation.fecha),
      })
    }
  }

  const scores = Array.from(latest.values())
    .map((evaluation) => evaluation.promedio)
    .filter((score): score is number => score !== null)

  const pendingPeople = Array.from(roster.values())
    .filter((person) => !latest.has(person.labId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return {
    year,
    evaluated: latest.size,
    pending: pendingPeople.length,
    average:
      scores.length === 0
        ? null
        : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10,
    recent,
    pendingNames: pendingPeople.slice(0, PENDING_NAMES).map((person) => person.nombre),
  }
}

/* ---------------------------------------------------------------- contracts */

export interface ExpiringContract {
  labId: number
  employeeId: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  /** "30 oct" */
  dateLabel: string
  /** Negative: the scheduled end already went by and the contract is still open. */
  daysLeft: number
}

/**
 * Contracts in force whose scheduled end falls within `windowDays`, or
 * already went by without being closed — those come first, since they are
 * the ones that need a decision (renew or terminate).
 */
export function toExpiringContracts(
  roster: Iterable<RosterPerson>,
  todayIso: string,
  windowDays: number
): ExpiringContract[] {
  const todayMs = isoToMs(todayIso)
  const contracts: ExpiringContract[] = []

  for (const person of roster) {
    if (!person.fechaFinProgramada) continue
    const daysLeft = Math.round((isoToMs(person.fechaFinProgramada) - todayMs) / MS_PER_DAY)
    if (Number.isNaN(daysLeft) || daysLeft > windowDays) continue

    contracts.push({
      labId: person.labId,
      employeeId: person.employeeId,
      nombre: person.nombre,
      puesto: person.puesto,
      sucursal: person.sucursal,
      dateLabel: shortDate(person.fechaFinProgramada),
      daysLeft,
    })
  }

  return contracts.sort((a, b) => a.daysLeft - b.daysLeft || a.nombre.localeCompare(b.nombre))
}

/** "Vence hoy", "Vence mañana", "en 12 días", "Venció hace 3 días". */
export function expiryLabel(daysLeft: number) {
  if (daysLeft === 0) return 'Vence hoy'
  if (daysLeft === 1) return 'Vence mañana'
  if (daysLeft > 1) return `en ${daysLeft} días`
  if (daysLeft === -1) return 'Venció ayer'
  return `Venció hace ${-daysLeft} días`
}

/* ----------------------------------------------------------------- my marks */

export type MyDayStatus = 'none' | 'working' | 'break' | 'lunch' | 'done'

export interface MyDaySummary {
  status: MyDayStatus
  /** The six marks of a shift, in order; `time` is null until it is made. */
  steps: { key: string; label: string; time: string | null }[]
}

const STEP_LABELS = [
  ['entrada', 'Entrada'],
  ['inicioReceso', 'Receso'],
  ['finReceso', 'Fin receso'],
  ['inicioAlmuerzo', 'Almuerzo'],
  ['finAlmuerzo', 'Fin almuerzo'],
  ['salida', 'Salida'],
] as const

/** Where the reader is in their shift, from today's marks (null: none yet). */
export function describeMyDay(day: MyAttendanceDay | null): MyDaySummary {
  const steps = STEP_LABELS.map(([key, label]) => ({
    key,
    label,
    time: day?.[key]?.time ?? null,
  }))

  let status: MyDayStatus = 'none'
  if (day?.salida) status = 'done'
  else if (day?.inicioAlmuerzo && !day.finAlmuerzo) status = 'lunch'
  else if (day?.inicioReceso && !day.finReceso) status = 'break'
  else if (day?.entrada) status = 'working'

  return { status, steps }
}
