import type { createClient } from '@/lib/supabase/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { groupIntoDayJourney, type DayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { marcaTipoSchema } from '@/modules/attendance/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type SupabaseAdminClient = ReturnType<typeof createAdminClient>

interface MarkDbRow {
  mar_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

export type LoadDayJourneyResult = { ok: true; journey: DayJourney } | { ok: false; error: string }

/**
 * La jornada de UN contrato en UN dia, a partir de sus marcas.
 *
 * El kiosco la lee con el cliente ADMIN, despues de validar permisos y turno:
 * la cuenta KIOSCO no puede leer marcas, y no debe poder. Las politicas de
 * UPDATE y DELETE de marcas solo piden ASISTENCIA_WRITE (que el kiosco tiene
 * para registrar), y en Postgres lo unico que le impedia modificar o borrar
 * marcas era no poder verlas.
 */
export async function loadDayJourney(
  supabase: SupabaseServerClient | SupabaseAdminClient,
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

export type ApprovedAbsenceResult = { ok: true; tipo: string | null } | { ok: false; error: string }

interface AusenciaTipoRow {
  sgrh_cat_tipos_ausencia: { tau_nombre: string; tau_es_intradia: boolean } | null
}

/**
 * Nombre del tipo de ausencia aprobada que cubre ese dia para ese contrato
 * (ej. "Incapacidad por Enfermedad"), o null si no hay (SGRH-88).
 *
 * Recibe el cliente ADMIN (createAdminClient): la cuenta KIOSCO no puede leer
 * sgrh_ausencias (observaciones, boletas de la CCSS), y esta bien que no
 * pueda. Solo se llama despues de validar permisos y de confirmar que el
 * contrato tiene turno en la sucursal del kiosco, y solo se lee el nombre del
 * tipo: nada de la ausencia sale de esta funcion. Los tipos intradia
 * (lactancia) no cuentan: se trabaja igual ese dia.
 *
 * Si la consulta falla, error y no "sin ausencia": dejar marcar a alguien
 * incapacitado por un error de red seria el mismo problema que se quiere
 * evitar. El llamador lo trata como fallo pasajero.
 */
export async function findApprovedAbsence(
  admin: SupabaseAdminClient,
  employmentHistoryId: number,
  dateISO: string
): Promise<ApprovedAbsenceResult> {
  const { data, error } = await admin
    .from('sgrh_ausencias')
    .select('sgrh_cat_tipos_ausencia ( tau_nombre, tau_es_intradia )')
    .eq('aus_historial_laboral_id', employmentHistoryId)
    .eq('aus_estado', 'aprobada')
    .lte('aus_fecha_inicio', dateISO)
    .gte('aus_fecha_fin', dateISO)
    .returns<AusenciaTipoRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo revisar si tienes una ausencia registrada hoy.' }
  }

  const cubre = (data ?? []).find(
    (a) => a.sgrh_cat_tipos_ausencia && !a.sgrh_cat_tipos_ausencia.tau_es_intradia
  )

  return { ok: true, tipo: cubre?.sgrh_cat_tipos_ausencia?.tau_nombre ?? null }
}

/** Lo que ve en el kiosco quien tiene una ausencia aprobada ese dia. */
export function absenceBlocksMarkMessage(tipo: string) {
  return `Tienes registrado "${tipo}" para hoy, asi que no puedes marcar. Si ya te reincorporaste, avisa al encargado.`
}
