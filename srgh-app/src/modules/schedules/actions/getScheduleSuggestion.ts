'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { compareByStart } from '@/modules/schedules/lib/dayAssignment'
import { isValidISODate } from '@/modules/schedules/lib/week'

export interface SuggestedDay {
  scheduleId: number | null
  isDayOff: boolean
  /**
   * Solo en dias de varios tramos (SGRH-110): ahi la sucursal es parte de lo
   * que se sugiere (manana en una tienda, tarde en otra). En un dia de un solo
   * tramo no se opina de sucursal y se usa la de casa de cada colaborador.
   */
  branchId?: number
  /** Los demas tramos del dia; el primero lo describen los campos de arriba. */
  extraTramos?: SuggestedDay[]
}

export type ScheduleSuggestionResult =
  { ok: true; byEmployment: Record<number, (SuggestedDay | null)[]> } | { ok: false; error: string }

interface HistoryRow {
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_sucursal_id: number
  prg_es_dia_libre: boolean
  prg_horario_id: number | null
  prg_hora_entrada_custom: string | null
  sgrh_cat_horarios: { hor_hora_entrada: string | null } | null
}

/** Tope de filas de historial que se leen (las mas recientes primero). */
const HISTORY_LIMIT = 5000

/** Lunes=0 ... domingo=6, igual que week.ts. */
function weekdayIndex(dateISO: string): number {
  const day = new Date(`${dateISO}T00:00:00`).getDay()
  return day === 0 ? 6 : day - 1
}

interface Tramo {
  scheduleId: number
  branchId: number
  start: string | null
}

/**
 * Lo que "se hizo" un dia, como una clave comparable y lo que se sugeriria:
 *  - descanso: "LIBRE";
 *  - un tramo: "H<horario>" (sin sucursal, como siempre);
 *  - varios tramos: "H<horario>@<sucursal>|..." en orden de hora de inicio.
 * Devuelve null si el dia no sirve para sugerir (ver getScheduleSuggestion).
 */
function summarizeDay(rows: HistoryRow[]): { key: string; day: SuggestedDay } | null {
  // Un dia con horas a medida en cualquiera de sus tramos no tiene un horario
  // "tipico" que resumir: no vota, ni siquiera con sus otros tramos.
  if (rows.some((row) => Boolean(row.prg_hora_entrada_custom))) return null

  if (rows.some((row) => row.prg_es_dia_libre)) {
    // Un descanso convive con nada; si el historial trae un dia incoherente, no se adivina.
    return rows.length === 1 ? { key: 'LIBRE', day: { scheduleId: null, isDayOff: true } } : null
  }

  const tramos: Tramo[] = rows
    .filter((row) => row.prg_horario_id != null)
    .map((row) => ({
      scheduleId: row.prg_horario_id!,
      branchId: row.prg_sucursal_id,
      start: row.sgrh_cat_horarios?.hor_hora_entrada ?? null,
    }))
    // Mismo orden que ve la matriz: por hora de inicio; el resto, determinista.
    .sort(
      (a, b) =>
        compareByStart(a.start, b.start) || a.scheduleId - b.scheduleId || a.branchId - b.branchId
    )

  if (tramos.length === 0) return null

  if (tramos.length === 1) {
    return {
      key: `H${tramos[0].scheduleId}`,
      day: { scheduleId: tramos[0].scheduleId, isDayOff: false },
    }
  }

  const [first, ...rest] = tramos.map((tramo): SuggestedDay => ({
    scheduleId: tramo.scheduleId,
    isDayOff: false,
    branchId: tramo.branchId,
  }))

  return {
    key: tramos.map((tramo) => `H${tramo.scheduleId}@${tramo.branchId}`).join('|'),
    day: { ...first, extraTramos: rest },
  }
}

/**
 * Sugiere, por colaborador y dia de la semana, el dia que mas se repite en
 * su historial (o descanso, si eso es lo mas frecuente) — para prellenar una
 * semana nueva sin arrancar de cero.
 *
 * Se vota por DIA completo, no por fila: un dia de dos tramos (8-12 en una
 * sucursal y 13-17 en otra, SGRH-110) cuenta un voto como ese par de tramos,
 * y se sugiere el par completo. Los dias con horas a medida (en cualquier
 * tramo) no participan del conteo: no hay un "horario tipico" que resuma
 * horas sueltas, asi que ese dia queda sin sugerencia en vez de inventar una.
 */
export async function getScheduleSuggestion(
  employmentHistoryIds: number[],
  beforeDateISO: string
): Promise<ScheduleSuggestionResult> {
  // RLS policies on sgrh_programacion_semanal require ASISTENCIA_READ.
  await requirePermission(PERMISOS.ASISTENCIA_READ)

  if (employmentHistoryIds.length === 0) {
    return { ok: true, byEmployment: {} }
  }

  if (!isValidISODate(beforeDateISO)) {
    return { ok: false, error: 'Fecha invalida.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_programacion_semanal')
    .select(
      `prg_historial_laboral_id, prg_fecha, prg_sucursal_id, prg_es_dia_libre, prg_horario_id,
       prg_hora_entrada_custom, sgrh_cat_horarios ( hor_hora_entrada )`
    )
    .in('prg_historial_laboral_id', employmentHistoryIds)
    .lt('prg_fecha', beforeDateISO)
    .order('prg_fecha', { ascending: false })
    .limit(HISTORY_LIMIT)
    .returns<HistoryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el historial de horarios.' }
  }

  // Si se llego al tope, el dia mas antiguo pudo quedar cortado a la mitad (un
  // tramo leido y otro no): se descarta entero en vez de votar con un dia incompleto.
  const oldestDate = data.length >= HISTORY_LIMIT ? data[data.length - 1].prg_fecha : null
  const history = oldestDate ? data.filter((row) => row.prg_fecha !== oldestDate) : data

  // Filas de cada colaborador+fecha, en el orden en que aparecen (de mas reciente a mas antiguo).
  const rowsByDay = new Map<string, HistoryRow[]>()
  for (const row of history) {
    const dayKey = `${row.prg_historial_laboral_id}|${row.prg_fecha}`
    const rows = rowsByDay.get(dayKey)
    if (rows) rows.push(row)
    else rowsByDay.set(dayKey, [row])
  }

  // votos[empId][weekday] = Map<clave del dia, {count, day}>
  const votes = new Map<number, Map<number, Map<string, { count: number; day: SuggestedDay }>>>()

  for (const rows of rowsByDay.values()) {
    const summary = summarizeDay(rows)
    if (!summary) continue

    const { prg_historial_laboral_id: employmentHistoryId, prg_fecha: date } = rows[0]
    const weekday = weekdayIndex(date)

    let byWeekday = votes.get(employmentHistoryId)
    if (!byWeekday) {
      byWeekday = new Map()
      votes.set(employmentHistoryId, byWeekday)
    }

    let byKey = byWeekday.get(weekday)
    if (!byKey) {
      byKey = new Map()
      byWeekday.set(weekday, byKey)
    }

    const existing = byKey.get(summary.key)
    // Los dias se recorren de mas reciente a mas antiguo: el primer voto de
    // cada clave ya es el mas reciente, asi que un empate en conteo lo gana
    // quien se vio primero (no hace falta comparar fechas).
    if (existing) {
      existing.count += 1
    } else {
      byKey.set(summary.key, { count: 1, day: summary.day })
    }
  }

  const byEmployment: Record<number, (SuggestedDay | null)[]> = {}

  for (const employmentHistoryId of employmentHistoryIds) {
    const byWeekday = votes.get(employmentHistoryId)
    const days: (SuggestedDay | null)[] = Array.from({ length: 7 }, (_, weekday) => {
      const byKey = byWeekday?.get(weekday)
      if (!byKey || byKey.size === 0) return null

      let best: { count: number; day: SuggestedDay } | null = null
      for (const candidate of byKey.values()) {
        if (!best || candidate.count > best.count) best = candidate
      }
      return best!.day
    })
    byEmployment[employmentHistoryId] = days
  }

  return { ok: true, byEmployment }
}
