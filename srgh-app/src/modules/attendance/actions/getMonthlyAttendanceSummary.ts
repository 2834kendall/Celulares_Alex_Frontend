'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  classifyDay,
  classifyTardiness,
  type TardinessLevel,
} from '@/modules/attendance/lib/infractions'
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
  /** Banda de gravedad (SGRH-87): leve 1-5 min, tardia 6-10, grave 11+. */
  level: TardinessLevel
  /**
   * mar_id de la entrada. Lo necesita el modal para saber que tardanza
   * esta justificando; null solo en el caso teorico de un dia clasificado
   * como tardio sin marca detras, que classifyDay no produce.
   */
  markId: number | null
  /** El encargado ya la justifico: se muestra, pero no suma al conteo. */
  isJustified: boolean
  /** Motivo escrito al justificarla. */
  justification: string | null
}

export interface MonthlyEmployeeSummary {
  employeeId: number
  employmentHistoryId: number
  fullName: string
  tardias: number
  ausencias: number
  /**
   * Ordenados cronologicamente — el detalle que summarizeMonth solo cuenta.
   * Incluye las justificadas: siguen viendose en el reporte aunque no sumen
   * a `tardias`, para no perder la trazabilidad del atraso.
   */
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

      if (status === 'tardio' || status === 'tardio_justificado') {
        // Las dos ramas solo se alcanzan con entradaTime y expectedStart
        // no-nulos (sin entrada el resultado seria 'ausente' antes de llegar
        // aca) — las aserciones son seguras.
        const atraso = diffMinutes(day.entradaTime!, day.expectedStart!)

        tardyDays.push({
          date: day.date,
          entradaTime: day.entradaTime!,
          diffMinutes: atraso,
          // classifyTardiness nunca devuelve null aca: si el atraso fuera
          // <= 0 el dia habria salido 'a_tiempo'.
          level: classifyTardiness(atraso) ?? 'leve',
          markId: day.entradaMarkId,
          isJustified: status === 'tardio_justificado',
          justification: day.tardiaJustificacion,
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
      // Solo las NO justificadas: es el numero que dispara la advertencia
      // del mes, y el que el encargado necesita ver como "deuda" real.
      tardias: tardyDays.filter((d) => !d.isJustified).length,
      ausencias: absentDays.length,
      tardyDays,
      absentDays,
    }
  })

  data.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  return { ok: true, start, end, data }
}
