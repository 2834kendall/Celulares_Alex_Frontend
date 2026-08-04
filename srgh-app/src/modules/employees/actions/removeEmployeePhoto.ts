'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'

export type RemoveEmployeePhotoResult = { ok: true } | { ok: false; error: string }

/**
 * Quita la foto de un empleado (SGRH-67). La base de datos es la fuente de
 * verdad: se limpia PRIMERO (así la UI deja de mostrar la foto de inmediato,
 * cae a iniciales); el borrado del objeto en storage es best-effort después
 * — si falla, solo queda un huérfano inofensivo en un bucket privado (nadie
 * más lo referencia), se loguea y no bloquea la respuesta.
 */
export async function removeEmployeePhoto(empId: number): Promise<RemoveEmployeePhotoResult> {
  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // Cross-tenant: mismo criterio que setEmployeePhoto — un empId ajeno no
  // aparece bajo RLS, así que "no existe" para este usuario.
  const { data: empleado, error: empleadoError } = await supabase
    .from('sgrh_empleados')
    .select('emp_id, emp_foto_path')
    .eq('emp_id', empId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  // Nada que quitar: idempotente, no es un error.
  if (!empleado.emp_foto_path) {
    return { ok: true }
  }

  const { error: updateError } = await supabase
    .from('sgrh_empleados')
    .update({ emp_foto_path: null })
    .eq('emp_id', empId)

  if (updateError) {
    return { ok: false, error: 'No se pudo quitar la foto del empleado.' }
  }

  const removed = await getStorageProvider().remove('FOTOS_EMPLEADO', [empleado.emp_foto_path])
  if (!removed.ok) {
    console.error(
      `removeEmployeePhoto: no se pudo borrar el objeto en storage (path=${empleado.emp_foto_path})`
    )
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${empId}`)
  return { ok: true }
}
