'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { isValidISODate } from '@/modules/schedules/lib/week'

export interface SuggestedDay {
  scheduleId: number | null
  isDayOff: boolean
}

export type ScheduleSuggestionResult =
  { ok: true; byEmployment: Record<number, (SuggestedDay | null)[]> } | { ok: false; error: string }

interface HistoryRow {
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_horario_id: number | null
  prg_hora_entrada_custom: string | null
}

/** Lunes=0 ... domingo=6, igual que week.ts. */
function weekdayIndex(dateISO: string): number {
  const day = new Date(`${dateISO}T00:00:00`).getDay()
  return day === 0 ? 6 : day - 1
}

/**
 * Sugiere, por colaborador y dia de la semana, el turno que mas se repite en
 * su historial (o descanso, si eso es lo mas frecuente) — para prellenar una
 * semana nueva sin arrancar de cero. Los dias personalizados (horas a
 * medida) no participan del conteo: no hay un "horario tipico" que resuma
 * horas sueltas, asi que ese dia queda sin sugerencia en vez de inventar
 * una.
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
      'prg_historial_laboral_id, prg_fecha, prg_es_dia_libre, prg_horario_id, prg_hora_entrada_custom'
    )
    .in('prg_historial_laboral_id', employmentHistoryIds)
    .lt('prg_fecha', beforeDateISO)
    .order('prg_fecha', { ascending: false })
    .limit(5000)
    .returns<HistoryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el historial de horarios.' }
  }

  // votos[empId][weekday] = Map<clave, {count, day}> — clave "LIBRE" o "H<id>".
  const votes = new Map<number, Map<number, Map<string, { count: number; day: SuggestedDay }>>>()

  for (const row of data) {
    const isCustom = Boolean(row.prg_hora_entrada_custom)
    if (isCustom) continue

    const key = row.prg_es_dia_libre
      ? 'LIBRE'
      : row.prg_horario_id != null
        ? `H${row.prg_horario_id}`
        : null
    if (key == null) continue

    const weekday = weekdayIndex(row.prg_fecha)
    const day: SuggestedDay = {
      scheduleId: row.prg_es_dia_libre ? null : row.prg_horario_id,
      isDayOff: row.prg_es_dia_libre,
    }

    let byWeekday = votes.get(row.prg_historial_laboral_id)
    if (!byWeekday) {
      byWeekday = new Map()
      votes.set(row.prg_historial_laboral_id, byWeekday)
    }

    let byKey = byWeekday.get(weekday)
    if (!byKey) {
      byKey = new Map()
      byWeekday.set(weekday, byKey)
    }

    const existing = byKey.get(key)
    // Los resultados vienen ordenados de mas reciente a mas antiguo: el
    // primer voto de cada clave ya es el mas reciente, asi que un empate en
    // conteo lo gana quien se vio primero (no hace falta comparar fechas).
    if (existing) {
      existing.count += 1
    } else {
      byKey.set(key, { count: 1, day })
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
