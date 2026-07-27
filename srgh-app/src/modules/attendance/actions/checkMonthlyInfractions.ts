'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  shouldWarn,
  summarizeMonth,
  type DayForInfraction,
} from '@/modules/attendance/lib/infractions'
import {
  dateOfDay,
  monthBoundsInCostaRica,
  timeOfDay,
  todayInCostaRica,
} from '@/modules/attendance/lib/time'
import { marcaTipoSchema } from '@/modules/attendance/types'

export type CheckMonthlyInfractionsResult = { ok: true } | { ok: false; error: string }

const DEFAULT_TOLERANCIA_MINUTOS = 2

interface HistorialRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
}

interface SucursalToleranciaRow {
  suc_id: number
  suc_tolerancia_tardia_minutos: number
}

interface AssignmentJoin {
  hor_hora_entrada: string
}

interface AssignmentRow {
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_hora_entrada_custom: string | null
  sgrh_cat_horarios: AssignmentJoin | null
}

interface MarkDbRow {
  mar_historial_laboral_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

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

  let sucursalId: number | null = null
  if (meta.usr_id) {
    const { data: asignacion } = await supabase
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_sucursal_id')
      .eq('uer_usuario_id', meta.usr_id)
      .eq('uer_activo', true)
      .maybeSingle<{ uer_sucursal_id: number | null }>()
    sucursalId = asignacion?.uer_sucursal_id ?? null
  }

  let historialQuery = supabase
    .from('sgrh_historial_laboral')
    .select('lab_id, lab_empleado_id, lab_sucursal_id')
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)

  if (sucursalId !== null) {
    historialQuery = historialQuery.eq('lab_sucursal_id', sucursalId)
  }

  const { data: historial, error: errHistorial } = await historialQuery.returns<HistorialRow[]>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  if (historial.length === 0) {
    return { ok: true }
  }

  const { start, end } = monthBoundsInCostaRica(todayInCostaRica())
  const historyIds = historial.map((h) => h.lab_id)
  const sucursalIds = Array.from(new Set(historial.map((h) => h.lab_sucursal_id)))

  const [
    { data: tolerancias, error: errTolerancias },
    { data: assignments, error: errAssignments },
    { data: marks, error: errMarks },
  ] = await Promise.all([
    supabase
      .from('sgrh_sucursales')
      .select('suc_id, suc_tolerancia_tardia_minutos')
      .in('suc_id', sucursalIds)
      .returns<SucursalToleranciaRow[]>(),
    supabase
      .from('sgrh_programacion_semanal')
      .select(
        `
        prg_historial_laboral_id,
        prg_fecha,
        prg_es_dia_libre,
        prg_es_feriado,
        prg_hora_entrada_custom,
        sgrh_cat_horarios ( hor_hora_entrada )
      `
      )
      .in('prg_historial_laboral_id', historyIds)
      .gte('prg_fecha', start)
      .lte('prg_fecha', end)
      .returns<AssignmentRow[]>(),
    supabase
      .from('sgrh_marcas_asistencia')
      .select('mar_historial_laboral_id, mar_tipo, mar_fecha_hora')
      .in('mar_historial_laboral_id', historyIds)
      .eq('mar_tipo', 'entrada')
      .gte('mar_fecha_hora', `${start} 00:00:00`)
      .lte('mar_fecha_hora', `${end} 23:59:59`)
      .returns<MarkDbRow[]>(),
  ])

  if (errTolerancias || errAssignments || errMarks) {
    return { ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' }
  }

  const toleranciaBySucursal = new Map(
    (tolerancias ?? []).map((t) => [t.suc_id, t.suc_tolerancia_tardia_minutos])
  )

  const assignmentsByHist = new Map<number, AssignmentRow[]>()
  for (const a of assignments ?? []) {
    const list = assignmentsByHist.get(a.prg_historial_laboral_id) ?? []
    list.push(a)
    assignmentsByHist.set(a.prg_historial_laboral_id, list)
  }

  // Primera marca de entrada valida por (historial, fecha) — mismo criterio
  // de "primera cronologica gana" que groupIntoDayJourney, aplicado por dia.
  const entradaByHistAndDate = new Map<string, string>()
  for (const m of marks ?? []) {
    const parsedTipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (!parsedTipo.success || parsedTipo.data !== 'entrada') continue

    const date = dateOfDay(m.mar_fecha_hora)
    const key = `${m.mar_historial_laboral_id}|${date}`
    const time = timeOfDay(m.mar_fecha_hora)
    const existing = entradaByHistAndDate.get(key)
    if (!existing || time < existing) {
      entradaByHistAndDate.set(key, time)
    }
  }

  for (const h of historial) {
    const tolerancia = toleranciaBySucursal.get(h.lab_sucursal_id) ?? DEFAULT_TOLERANCIA_MINUTOS
    const myAssignments = assignmentsByHist.get(h.lab_id) ?? []

    const days: DayForInfraction[] = myAssignments.map((a) => {
      const expectedRaw = a.prg_hora_entrada_custom ?? a.sgrh_cat_horarios?.hor_hora_entrada ?? ''
      return {
        isDayOff: a.prg_es_dia_libre,
        isHoliday: a.prg_es_feriado,
        expectedStart: expectedRaw ? timeOfDay(expectedRaw) : null,
        entradaTime: entradaByHistAndDate.get(`${h.lab_id}|${a.prg_fecha}`) ?? null,
        toleranciaMinutos: tolerancia,
      }
    })

    const summary = summarizeMonth(days)
    if (!shouldWarn(summary)) continue

    const { data: yaAvisado } = await supabase
      .from('sgrh_notificaciones')
      .select('ntf_id')
      .eq('ntf_empleado_id', h.lab_empleado_id)
      .eq('ntf_tipo_notificacion', 'advertencia')
      .gte('ntf_created_at', `${start} 00:00:00`)
      .limit(1)

    if (yaAvisado && yaAvisado.length > 0) continue

    await supabase.from('sgrh_notificaciones').insert({
      ntf_empleado_id: h.lab_empleado_id,
      ntf_empresa_id: meta.empresa_id,
      ntf_tipo_notificacion: 'advertencia',
      ntf_canal: 'app',
      ntf_titulo: 'Advertencia de asistencia',
      ntf_mensaje: `Este mes acumulaste ${summary.tardias} tardia(s) y ${summary.ausencias} ausencia(s). Conversa con tu encargado si necesitas ayuda.`,
    })
  }

  return { ok: true }
}
