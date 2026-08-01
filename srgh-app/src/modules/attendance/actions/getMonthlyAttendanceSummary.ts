'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { classifyDay } from '@/modules/attendance/lib/infractions'
import { gatherMonthlyAttendanceDays } from '@/modules/attendance/lib/monthlySummary'
import { diffMinutes, monthBoundsInCostaRica } from '@/modules/attendance/lib/time'
import {
  getMonthlyAttendanceSummarySchema,
  type GetMonthlyAttendanceSummaryInput,
} from '@/modules/attendance/types'

export interface TardyDay {
  date: string
  /** "HH:mm" real de la entrada. */
  entradaTime: string
  diffMinutes: number
}

export interface MonthlyEmployeeSummary {
  employeeId: number
  employmentHistoryId: number
  fullName: string
  tardias: number
  ausencias: number
  /** Ordenados cronologicamente — el detalle que summarizeMonth solo cuenta. */
  tardyDays: TardyDay[]
  absentDays: string[]
}

export type GetMonthlyAttendanceSummaryResult =
  | { ok: true; start: string; end: string; data: MonthlyEmployeeSummary[] }
  | { ok: false; error: string }

/**
 * Reporte navegable (mes a mes) de tardias y ausencias por colaborador, con
 * el detalle de que dias exactamente — a diferencia de checkMonthlyInfractions,
 * que solo dispara una advertencia silenciosa sin mostrarle nada de esto al
 * gerente. Comparte la reunion de datos con esa accion
 * (gatherMonthlyAttendanceDays); aca solo se clasifica cada dia (classifyDay)
 * y se separan las fechas en dos listas.
 */
export async function getMonthlyAttendanceSummary(
  input: GetMonthlyAttendanceSummaryInput
): Promise<GetMonthlyAttendanceSummaryResult> {
  const parsed = getMonthlyAttendanceSummarySchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_READ)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { start, end } = monthBoundsInCostaRica(parsed.data.fecha)

  const gathered = await gatherMonthlyAttendanceDays(
    supabase,
    meta.empresa_id,
    meta.usr_id,
    start,
    end
  )

  if (!gathered.ok) {
    return { ok: false, error: gathered.error }
  }

  const data: MonthlyEmployeeSummary[] = gathered.data.map((employee) => {
    const tardyDays: TardyDay[] = []
    const absentDays: string[] = []

    for (const day of employee.days) {
      const status = classifyDay(day)

      if (status === 'tardio') {
        // classifyDay solo devuelve 'tardio' cuando entradaTime y expectedStart
        // son ambos no-nulos (si entradaTime faltara, el resultado seria
        // 'ausente' antes de llegar aca) — las aserciones son seguras.
        tardyDays.push({
          date: day.date,
          entradaTime: day.entradaTime!,
          diffMinutes: diffMinutes(day.entradaTime!, day.expectedStart!),
        })
      } else if (status === 'ausente') {
        absentDays.push(day.date)
      }
    }

    tardyDays.sort((a, b) => a.date.localeCompare(b.date))
    absentDays.sort((a, b) => a.localeCompare(b))

    return {
      employeeId: employee.employeeId,
      employmentHistoryId: employee.employmentHistoryId,
      fullName: employee.fullName,
      tardias: tardyDays.length,
      ausencias: absentDays.length,
      tardyDays,
      absentDays,
    }
  })

  data.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  return { ok: true, start, end, data }
}
