'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

interface TipoJoin {
  tau_codigo: string
  tau_nombre: string
  tau_es_intradia: boolean
}

interface AusenciaJoinRow {
  aus_id: number
  aus_historial_laboral_id: number
  aus_tipo_ausencia_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
  aus_numero_boleta_ccss: string | null
  aus_observaciones: string | null
  sgrh_cat_tipos_ausencia: TipoJoin | null
}

export interface AusenciaWeekRow {
  ausenciaId: number
  employmentHistoryId: number
  tipoAusenciaId: number
  fechaInicio: string
  fechaFin: string
  tipoCodigo: string
  tipoNombre: string
  esIntradia: boolean
  numeroBoletaCcss: string | null
  observaciones: string | null
}

export type GetAusenciasForWeekResult =
  { ok: true; data: AusenciaWeekRow[] } | { ok: false; error: string }

/**
 * Ausencias (incapacidades y licencias) que se solapan con la semana dada,
 * para superponerlas sobre la matriz de horarios. Filtra por empresa via
 * historial laboral, igual que getWeeklySchedule.
 */
export async function getAusenciasForWeek(
  weekStartISO: string,
  weekEndISO: string
): Promise<GetAusenciasForWeekResult> {
  const claims = await requirePermission(PERMISOS.AUSENCIAS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data: employmentHistory, error: errHistory } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id')
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)

  if (errHistory) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const employmentHistoryIds = (employmentHistory ?? []).map((h) => h.lab_id as number)

  if (employmentHistoryIds.length === 0) {
    return { ok: true, data: [] }
  }

  const { data, error } = await supabase
    .from('sgrh_ausencias')
    .select(
      `
      aus_id,
      aus_historial_laboral_id,
      aus_tipo_ausencia_id,
      aus_fecha_inicio,
      aus_fecha_fin,
      aus_numero_boleta_ccss,
      aus_observaciones,
      sgrh_cat_tipos_ausencia ( tau_codigo, tau_nombre, tau_es_intradia )
    `
    )
    .in('aus_historial_laboral_id', employmentHistoryIds)
    .lte('aus_fecha_inicio', weekEndISO)
    .gte('aus_fecha_fin', weekStartISO)
    .returns<AusenciaJoinRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar las incapacidades y periodos de lactancia.' }
  }

  const rows: AusenciaWeekRow[] = data
    .filter((a) => a.sgrh_cat_tipos_ausencia)
    .map((a) => ({
      ausenciaId: a.aus_id,
      employmentHistoryId: a.aus_historial_laboral_id,
      tipoAusenciaId: a.aus_tipo_ausencia_id,
      fechaInicio: a.aus_fecha_inicio,
      fechaFin: a.aus_fecha_fin,
      tipoCodigo: a.sgrh_cat_tipos_ausencia!.tau_codigo,
      tipoNombre: a.sgrh_cat_tipos_ausencia!.tau_nombre,
      esIntradia: a.sgrh_cat_tipos_ausencia!.tau_es_intradia,
      numeroBoletaCcss: a.aus_numero_boleta_ccss,
      observaciones: a.aus_observaciones,
    }))

  return { ok: true, data: rows }
}
