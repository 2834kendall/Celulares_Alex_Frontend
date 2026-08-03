'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { buildLabPath } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type UploadLabImageResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * Sube una imagen al laboratorio de storage (TEMPORAL, se borra en fase 2).
 * El archivo viaja por FormData y TODA la validación es server-side: el tipo
 * real sale de los magic bytes (jamás de file.type) y la ruta se construye
 * SIEMPRE con el empresa_id del JWT — el cliente nunca elige dónde escribe.
 */
export async function uploadLabImage(formData: FormData): Promise<UploadLabImageResult> {
  const file = formData.get('file')
  // Input inválido: se corta ANTES de tocar permisos/proveedor (patrón del repo).
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'FOTOS_EMPLEADO')
  if (!check.ok) {
    return { ok: false, error: storageErrorMessage(check.error) }
  }

  const path = buildLabPath(empresaId, check.extension)
  const result = await getStorageProvider().upload({
    container: 'FOTOS_EMPLEADO',
    path,
    body: bytes,
    contentType: check.mimeType,
  })

  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  revalidatePath('/settings/storage-lab')
  return { ok: true, path: result.data.path }
}
