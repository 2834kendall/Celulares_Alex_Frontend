'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type LinkPostulacionToEmployeeResult = { ok: true } | { ok: false; error: string }

/**
 * Cierra una postulación como "contratado" y la enlaza al empleado recién
 * creado. Se llama DESPUÉS de que EmployeeWizard ya creó al empleado
 * (createEmployee ya resolvió con éxito) — mismo patrón "best-effort tras
 * el alta atómica" que usa inviteUser: si esto falla, el empleado ya existe
 * y queda un warning en vez de revertir el alta.
 */
export async function linkPostulacionToEmployee(
  postulacionId: number,
  empId: number
): Promise<LinkPostulacionToEmployeeResult> {
  if (!Number.isInteger(postulacionId) || postulacionId <= 0) {
    return { ok: false, error: 'Postulación no encontrada.' }
  }
  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)

  const supabase = await createClient()
  const { data: postulacion, error } = await supabase
    .from('sgrh_postulaciones')
    .update({
      pos_estado_final: 'contratado',
      pos_empleado_id: empId,
      pos_fecha_cierre: new Date().toISOString().slice(0, 10),
    })
    .eq('pos_id', postulacionId)
    .eq('pos_estado_final', 'en_proceso')
    .select('pos_candidato_id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'No se pudo cerrar la postulación como contratada.' }
  }
  if (!postulacion) {
    return { ok: false, error: 'La postulación ya no está en proceso.' }
  }

  revalidatePath('/recruitment')
  revalidatePath(`/recruitment/candidates/${postulacion.pos_candidato_id}`)
  return { ok: true }
}
