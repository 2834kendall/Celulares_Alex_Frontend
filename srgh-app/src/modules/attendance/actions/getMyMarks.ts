'use server'

import { createClient } from '@/lib/supabase/server'
import { groupIntoDayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { dateOfDay, shiftISODate, timeOfDay, todayInCostaRica } from '@/modules/attendance/lib/time'
import { marcaTipoSchema } from '@/modules/attendance/types'
import type { SgrhJwtClaims } from '@/types/auth'

const QUINCENA_DIAS = 14

interface MarkDbRow {
  mar_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

export interface MyAttendanceDayMark {
  time: string
}

export interface MyAttendanceDay {
  /** "YYYY-MM-DD" */
  date: string
  entrada: MyAttendanceDayMark | null
  inicioAlmuerzo: MyAttendanceDayMark | null
  finAlmuerzo: MyAttendanceDayMark | null
  salida: MyAttendanceDayMark | null
}

export type GetMyMarksResult = { ok: true; data: MyAttendanceDay[] } | { ok: false; error: string }

/**
 * Historial de marcas del propio empleado autenticado, ultima quincena.
 * Autoservicio: NO llama a requirePermission a proposito — es el empleado
 * viendo sus propios datos, no una vista administrativa. La policy
 * `marcas_select` ya deja ver las marcas propias (mar_historial_laboral_id
 * ligado a un contrato de get_emp_id()) sin exigir ningun permiso de
 * asistencia, asi que el filtro de identidad lo hace RLS, no este codigo.
 */
export async function getMyMarks(): Promise<GetMyMarksResult> {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    return { ok: false, error: 'No se pudo verificar tu sesion.' }
  }

  const meta = (claimsData.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>

  if (!meta.emp_id) {
    return { ok: true, data: [] }
  }

  const today = todayInCostaRica()
  const startDate = shiftISODate(today, -QUINCENA_DIAS)

  const { data, error } = await supabase
    .from('sgrh_marcas_asistencia')
    .select('mar_id, mar_tipo, mar_fecha_hora')
    .gte('mar_fecha_hora', `${startDate} 00:00:00`)
    .lte('mar_fecha_hora', `${today} 23:59:59`)
    .returns<MarkDbRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar tu historial de marcas.' }
  }

  const marksByDate = new Map<string, RawMark[]>()
  for (const m of data ?? []) {
    const parsedTipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (!parsedTipo.success) continue

    const date = dateOfDay(m.mar_fecha_hora)
    const list = marksByDate.get(date) ?? []
    list.push({ id: m.mar_id, tipo: parsedTipo.data, fechaHora: m.mar_fecha_hora })
    marksByDate.set(date, list)
  }

  const days: MyAttendanceDay[] = Array.from(marksByDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, marks]) => {
      const journey = groupIntoDayJourney(marks)

      function markOf(mark: RawMark | null): MyAttendanceDayMark | null {
        return mark ? { time: timeOfDay(mark.fechaHora) } : null
      }

      return {
        date,
        entrada: markOf(journey.entrada),
        inicioAlmuerzo: markOf(journey.inicioAlmuerzo),
        finAlmuerzo: markOf(journey.finAlmuerzo),
        salida: markOf(journey.salida),
      }
    })

  return { ok: true, data: days }
}
