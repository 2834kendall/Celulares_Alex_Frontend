'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { pathBelongsToEmpresa } from '@/lib/storage/paths'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type RemoveLabDocumentResult = { ok: true } | { ok: false; error: string }

/**
 * Borra un documento del laboratorio. Espejo de removeLabFile pero sobre
 * DOCUMENTOS_EMPLEADO y gateado por DOCUMENTOS_WRITE.
 */
export async function removeLabDocument(path: string): Promise<RemoveLabDocumentResult> {
  if (typeof path !== 'string' || path.trim() === '') {
    return { ok: false, error: 'Archivo inválido.' }
  }

  const claims = await requirePermission(PERMISOS.DOCUMENTOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  if (!pathBelongsToEmpresa(path, empresaId)) {
    return { ok: false, error: storageErrorMessage('FORBIDDEN') }
  }

  const result = await getStorageProvider().remove('DOCUMENTOS_EMPLEADO', [path])
  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  revalidatePath('/settings/storage-lab')
  return { ok: true }
}
