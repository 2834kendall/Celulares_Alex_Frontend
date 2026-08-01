'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_DESCARGA } from '@/lib/storage/containers'
import { pathBelongsToEmpresa, sanitizeFileName } from '@/lib/storage/paths'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type GetLabDocumentDownloadUrlResult =
  { ok: true; url: string } | { ok: false; error: string }

/**
 * Firma la descarga FORZADA de un documento del lab: TTL de 60 s (se consume
 * al clic) + downloadAs (Content-Disposition: attachment — un PDF con
 * contenido activo jamás corre en nuestro origen). El path y el fileName
 * vienen del CLIENTE: el path se valida contra la empresa del JWT y el nombre
 * se sanitiza server-side. En fase 3 el nombre saldrá de sgrh_documentos.
 */
export async function getLabDocumentDownloadUrl(
  path: string,
  fileName: string
): Promise<GetLabDocumentDownloadUrlResult> {
  if (typeof path !== 'string' || path.trim() === '') {
    return { ok: false, error: 'Archivo inválido.' }
  }

  const claims = await requirePermission(PERMISOS.DOCUMENTOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  if (!pathBelongsToEmpresa(path, empresaId)) {
    return { ok: false, error: storageErrorMessage('FORBIDDEN') }
  }

  const downloadAs = sanitizeFileName(typeof fileName === 'string' ? fileName : '')
  const result = await getStorageProvider().getSignedUrl(
    'DOCUMENTOS_EMPLEADO',
    path,
    TTL_DESCARGA,
    { downloadAs }
  )

  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  return { ok: true, url: result.data }
}
