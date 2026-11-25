'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { manualMarkSchema, marcaTipoSchema, type ManualMarkInput } from '@/modules/attendance/types'
import { MARK_LABELS } from '@/modules/attendance/lib/marks'
import { bloquesDelDia, scheduledBlockAtTime } from '@/modules/attendance/lib/dayJourney'

export type SaveManualMarkResult = { ok: true } | { ok: false; error: string }

/** Nombre de la marca en minuscula, para meterlo dentro de una oracion. */
function markLabel(tipo: string): string {
  const parsed = marcaTipoSchema.safeParse(tipo)
  return parsed.success ? MARK_LABELS[parsed.data].toLowerCase() : tipo
}

/**
 * Avisa al empleado que un gerente le corrigio/agrego una marca. Es "mejor
 * esfuerzo": si falla, no bloquea el guardado de la marca (que ya se hizo) —
 * igual que el resto de notificaciones best-effort del proyecto.
 */
async function notifyEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: number | undefined,
  employeeId: number,
  tipo: string,
  isCorrection: boolean
) {
  if (!empresaId) return

  const accion = isCorrection ? 'corrigió' : 'agregó'
  await supabase.from('sgrh_notificaciones').insert({
    ntf_empresa_id: empresaId,
    ntf_empleado_id: employeeId,
    ntf_tipo_notificacion: 'informacion',
    ntf_canal: 'app',
    ntf_titulo: 'Marca de asistencia actualizada',
    ntf_mensaje: `Un encargado ${accion} tu marca de ${markLabel(tipo)}.`,
  })
}

export async function saveManualMark(input: ManualMarkInput): Promise<SaveManualMarkResult> {
  const parsed = manualMarkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la marca inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  // Tarea del encargado, no del kiosco: la cuenta KIOSCO tiene
  // ASISTENCIA_WRITE para registrar su marca, pero no ASISTENCIA_READ. Sin
  // esta guarda, la sesion de la tablet podia invocar esta accion (SGRH-88).
  const permisos = (claims.app_metadata as { permisos?: string[] }).permisos ?? []
  if (!permisos.includes(PERMISOS.ASISTENCIA_READ)) {
    return { ok: false, error: 'No tienes permiso para registrar marcas manuales.' }
  }

  const { markId, employmentHistoryId, employeeId, sucursalId, tipo, fecha, hora, observacion } =
    parsed.data

  const supabase = await createClient()

  const payload = {
    mar_historial_laboral_id: employmentHistoryId,
    mar_tipo: tipo,
    mar_fecha_hora: `${fecha} ${hora}:00`,
    mar_metodo_verificacion: 'MANUAL',
    mar_registrado_por_id: meta.usr_id ?? null,
    mar_observacion: observacion,
  }

  // Corregir una marca cambia su hora, no donde se hizo: en un dia con un
  // tramo por sucursal (SGRH-110) la sucursal de la fila es la del primer
  // tramo, y reescribirla movia a ella la marca del segundo. La sucursal solo
  // se fija al crear la marca.
  let branchId = sucursalId
  if (markId === null) {
    const schedule = await bloquesDelDia(supabase, employmentHistoryId, fecha)
    if (schedule.ok) {
      branchId = scheduledBlockAtTime(schedule.bloques, hora, tipo)?.branchId ?? sucursalId
    }
  }

  const { data, error } = markId
    ? await supabase
        .from('sgrh_marcas_asistencia')
        .update(payload)
        .eq('mar_id', markId)
        .select('mar_id')
    : await supabase
        .from('sgrh_marcas_asistencia')
        .insert({ ...payload, mar_sucursal_id: branchId })
        .select('mar_id')

  if (error || !data?.length) {
    return { ok: false, error: 'No se pudo guardar la marca.' }
  }

  await notifyEmployee(supabase, meta.empresa_id, employeeId, tipo, markId !== null)

  revalidatePath('/attendance')

  return { ok: true }
}
