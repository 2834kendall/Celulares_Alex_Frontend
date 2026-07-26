'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { manualMarkSchema, type ManualMarkInput } from '@/modules/attendance/types'

export type SaveManualMarkResult = { ok: true } | { ok: false; error: string }

const MARK_LABEL: Record<string, string> = {
  ENTRADA: 'entrada',
  SALIDA: 'salida',
  INICIO_ALMUERZO: 'inicio de almuerzo',
  FIN_ALMUERZO: 'fin de almuerzo',
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

  const accion = isCorrection ? 'corrigio' : 'agrego'
  await supabase.from('sgrh_notificaciones').insert({
    ntf_empresa_id: empresaId,
    ntf_empleado_id: employeeId,
    ntf_tipo_notificacion: 'informacion',
    ntf_canal: 'app',
    ntf_titulo: 'Marca de asistencia actualizada',
    ntf_mensaje: `Un encargado ${accion} tu marca de ${MARK_LABEL[tipo] ?? tipo}.`,
  })
}

export async function saveManualMark(input: ManualMarkInput): Promise<SaveManualMarkResult> {
  const parsed = manualMarkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la marca invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  const { markId, employmentHistoryId, employeeId, sucursalId, tipo, fecha, hora, observacion } =
    parsed.data

  const supabase = await createClient()

  const payload = {
    mar_historial_laboral_id: employmentHistoryId,
    mar_sucursal_id: sucursalId,
    mar_tipo: tipo,
    mar_fecha_hora: `${fecha} ${hora}:00`,
    mar_metodo_verificacion: 'MANUAL',
    mar_registrado_por_id: meta.usr_id ?? null,
    mar_observacion: observacion,
  }

  const { error } = markId
    ? await supabase.from('sgrh_marcas_asistencia').update(payload).eq('mar_id', markId)
    : await supabase.from('sgrh_marcas_asistencia').insert(payload)

  if (error) {
    return { ok: false, error: 'No se pudo guardar la marca.' }
  }

  await notifyEmployee(supabase, meta.empresa_id, employeeId, tipo, markId !== null)

  revalidatePath('/attendance')

  return { ok: true }
}
