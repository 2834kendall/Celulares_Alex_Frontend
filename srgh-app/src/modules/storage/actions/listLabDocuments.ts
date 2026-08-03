'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'
import type { DocumentoLabItem } from '@/modules/storage/types'

export type ListLabDocumentsResult =
  { ok: true; items: DocumentoLabItem[] } | { ok: false; error: string }

/**
 * Lista los documentos del laboratorio de la empresa del JWT. A diferencia de
 * las fotos, NO firma URLs: los documentos no se renderizan inline — la única
 * salida es la descarga forzada, que firma al momento del clic.
 */
export async function listLabDocuments(): Promise<ListLabDocumentsResult> {
  const claims = await requirePermission(PERMISOS.DOCUMENTOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const listed = await getStorageProvider().list('DOCUMENTOS_EMPLEADO', `${empresaId}/_lab`)
  if (!listed.ok) {
    return { ok: false, error: storageErrorMessage(listed.error) }
  }

  return { ok: true, items: listed.data }
}
