'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { shouldWarn, summarizeMonth } from '@/modules/attendance/lib/infractions'
import { gatherMonthlyAttendanceDays } from '@/modules/attendance/lib/monthlySummary'
import { monthBoundsInCostaRica, todayInCostaRica } from '@/modules/attendance/lib/time'

export type CheckMonthlyInfractionsResult = { ok: true } | { ok: false; error: string }

/**
 * Calcula tardias/ausencias del mes en curso para la sucursal del gerente y
 * dispara (a lo sumo una vez por mes por empleado) la advertencia de
 * sgrh_notificaciones cuando se cruza el limite (RF-07/RF-08). Bajo demanda:
 * se llama cada vez que se abre el panel diario, no hay job programado.
 *
 * No interfiere con el kiosco: vive exclusivamente en el flujo del panel del
 * gerente, sin tocar registerKioskMark ni las acciones de marcado.
 */
export async function checkMonthlyInfractions(): Promise<CheckMonthlyInfractionsResult> {
  const claims = await requirePermission(PERMISOS.ASISTENCIA_READ)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { start, end } = monthBoundsInCostaRica(todayInCostaRica())

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

  for (const employee of gathered.data) {
    const summary = summarizeMonth(employee.days)
    if (!shouldWarn(summary)) continue

    const { data: yaAvisado } = await supabase
      .from('sgrh_notificaciones')
      .select('ntf_id')
      .eq('ntf_empleado_id', employee.employeeId)
      .eq('ntf_tipo_notificacion', 'advertencia')
      .gte('ntf_created_at', `${start} 00:00:00`)
      .limit(1)

    if (yaAvisado && yaAvisado.length > 0) continue

    await supabase.from('sgrh_notificaciones').insert({
      ntf_empleado_id: employee.employeeId,
      ntf_empresa_id: meta.empresa_id,
      ntf_tipo_notificacion: 'advertencia',
      ntf_canal: 'app',
      ntf_titulo: 'Advertencia de asistencia',
      ntf_mensaje: `Este mes acumulaste ${summary.tardias} tardia(s) y ${summary.ausencias} ausencia(s). Conversa con tu encargado si necesitas ayuda.`,
    })
  }

  return { ok: true }
}
