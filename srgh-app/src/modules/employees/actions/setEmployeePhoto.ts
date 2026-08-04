'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { buildEmployeePhotoPath } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type SetEmployeePhotoResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * Sube y asigna la foto de un empleado (SGRH-67). El archivo viaja por
 * FormData; toda la validación real es server-side (magic bytes, jamás
 * file.type) y la ruta se construye SIEMPRE con el empresa_id del JWT.
 *
 * Orden deliberado: 1) subir el objeto nuevo, 2) escribir la referencia en
 * sgrh_empleados (fuente de verdad) — si esto último falla, se revierte el
 * upload para no dejar un objeto huérfano apuntado por nadie. Si todo sale
 * bien, la foto ANTERIOR (si había) se borra best-effort: ya nadie la
 * referencia, así que un fallo ahí solo deja un huérfano inofensivo en un
 * bucket privado (se loguea, no bloquea la respuesta al usuario).
 */
export async function setEmployeePhoto(
  empId: number,
  formData: FormData
): Promise<SetEmployeePhotoResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // Cross-tenant ANTES de tocar el proveedor: RLS solo deja ver empleados de
  // la empresa del JWT, así que un empId ajeno simplemente "no existe" para
  // este usuario (mismo criterio que inviteUser con sgrh_empleados).
  const { data: empleado, error: empleadoError } = await supabase
    .from('sgrh_empleados')
    .select('emp_id, emp_foto_path')
    .eq('emp_id', empId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'FOTOS_EMPLEADO')
  if (!check.ok) {
    return { ok: false, error: storageErrorMessage(check.error) }
  }

  const provider = getStorageProvider()
  const path = buildEmployeePhotoPath(empresaId, empId, check.extension)
  const uploaded = await provider.upload({
    container: 'FOTOS_EMPLEADO',
    path,
    body: bytes,
    contentType: check.mimeType,
  })

  if (!uploaded.ok) {
    return { ok: false, error: storageErrorMessage(uploaded.error) }
  }

  // Se usa el path que devuelve el proveedor (no la variable local): mismo
  // criterio que uploadLabImage/uploadLabDocument — el proveedor es quien
  // confirma dónde quedó guardado el objeto.
  const newPath = uploaded.data.path

  const { error: updateError } = await supabase
    .from('sgrh_empleados')
    .update({ emp_foto_path: newPath })
    .eq('emp_id', empId)

  if (updateError) {
    // Nadie llegó a referenciar el objeto recién subido: se revierte.
    await provider.remove('FOTOS_EMPLEADO', [newPath])
    return { ok: false, error: 'No se pudo guardar la foto del empleado.' }
  }

  if (empleado.emp_foto_path) {
    const removed = await provider.remove('FOTOS_EMPLEADO', [empleado.emp_foto_path])
    if (!removed.ok) {
      console.error(
        `setEmployeePhoto: no se pudo borrar la foto anterior (path=${empleado.emp_foto_path})`
      )
    }
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${empId}`)
  return { ok: true, path: newPath }
}
