'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { buildLabPath, sanitizeFileName } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type UploadLabDocumentResult =
  { ok: true; path: string; fileName: string } | { ok: false; error: string }

/**
 * Sube un documento al laboratorio de storage (TEMPORAL, se borra en fase 2).
 * Espejo de uploadLabImage pero sobre DOCUMENTOS_EMPLEADO y gateado por
 * DOCUMENTOS_WRITE (permiso propio: los documentos del expediente son más
 * sensibles que la ficha). Devuelve el nombre original SANITIZADO para que la
 * UI lo muestre y lo use en la descarga forzada — el nombre jamás es ruta.
 */
export async function uploadLabDocument(formData: FormData): Promise<UploadLabDocumentResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  const claims = await requirePermission(PERMISOS.DOCUMENTOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'DOCUMENTOS_EMPLEADO')
  if (!check.ok) {
    return { ok: false, error: storageErrorMessage(check.error) }
  }

  const path = buildLabPath(empresaId, check.extension)
  const result = await getStorageProvider().upload({
    container: 'DOCUMENTOS_EMPLEADO',
    path,
    body: bytes,
    contentType: check.mimeType,
  })

  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  revalidatePath('/settings/storage-lab')
  return { ok: true, path: result.data.path, fileName: sanitizeFileName(file.name) }
}
