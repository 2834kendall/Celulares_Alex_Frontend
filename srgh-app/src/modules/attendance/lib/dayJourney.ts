import type { createClient } from '@/lib/supabase/server'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { groupIntoDayJourney, type DayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { marcaTipoSchema } from '@/modules/attendance/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface MarkDbRow {
  mar_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

export type LoadDayJourneyResult = { ok: true; journey: DayJourney } | { ok: false; error: string }

/**
 * La jornada de UN contrato en UN dia, a partir de sus marcas.
 *
 * Desde el kiosco depende de la politica "marcas_select_kiosco" (SGRH-88):
 * sin ella la cuenta KIOSCO recibe cero filas en silencio y la jornada
 * siempre parece vacia.
 */
export async function loadDayJourney(
  supabase: SupabaseServerClient,
  employmentHistoryId: number,
  dateISO: string
): Promise<LoadDayJourneyResult> {
  const { data, error } = await supabase
    .from('sgrh_marcas_asistencia')
    .select('mar_id, mar_tipo, mar_fecha_hora')
    .eq('mar_historial_laboral_id', employmentHistoryId)
    .gte('mar_fecha_hora', `${dateISO} 00:00:00`)
    .lte('mar_fecha_hora', `${dateISO} 23:59:59`)
    .returns<MarkDbRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar las marcas del dia.' }
  }

  const marks: RawMark[] = []
  for (const m of data ?? []) {
    const tipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (tipo.success) marks.push({ id: m.mar_id, tipo: tipo.data, fechaHora: m.mar_fecha_hora })
  }

  return { ok: true, journey: groupIntoDayJourney(marks) }
}

/**
 * Sucursales del kiosco: el claim del JWT si el hook ya lo emite, y si no,
 * por consulta. null o vacio = kiosco sin sucursal, que el llamador trata como
 * error — en un dispositivo fisicamente expuesto nunca se cae a "toda la
 * empresa".
 */
export async function resolveKioskSucursalIds(
  supabase: SupabaseServerClient,
  meta: { usr_id?: number; sucursal_ids?: number[] | null }
): Promise<number[] | null> {
  if (meta.sucursal_ids && meta.sucursal_ids.length > 0) return meta.sucursal_ids
  if (!meta.usr_id) return null
  return getUsuarioSucursalScope(supabase, meta.usr_id)
}
