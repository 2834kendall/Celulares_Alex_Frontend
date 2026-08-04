'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_DESCARGA } from '@/lib/storage/containers'
import { pathBelongsToEmpresa, sanitizeFileName } from '@/lib/storage/paths'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type GetEmployeeDocumentDownloadUrlResult =
  { ok: true; url: string } | { ok: false; error: string }

/**
 * Firma la descarga FORZADA de un documento del expediente: TTL de 60 s
 * (se consume al clic) + downloadAs (Content-Disposition: attachment — un
 * PDF con contenido activo jamás corre en nuestro origen).
 *
 * A diferencia del laboratorio, el path NUNCA viaja al cliente: se firma
 * por docId y el servidor lee el path de sgrh_documentos. El candado de
 * pathBelongsToEmpresa se mantiene igual (doble verificación junto a la RLS
 * del bucket).
 */
export async function getEmployeeDocumentDownloadUrl(
  docId: number
): Promise<GetEmployeeDocumentDownloadUrlResult> {
  if (!Number.isInteger(docId) || docId <= 0) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  const claims = await requirePermission(PERMISOS.DOCUMENTOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data: documento, error: documentoError } = await supabase
    .from('sgrh_documentos')
    .select('doc_path, doc_nombre')
    .eq('doc_id', docId)
    .maybeSingle()

  if (documentoError || !documento) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  if (!pathBelongsToEmpresa(documento.doc_path, empresaId)) {
    return { ok: false, error: storageErrorMessage('FORBIDDEN') }
  }

  const extension = documento.doc_path.slice(documento.doc_path.lastIndexOf('.'))
  const baseName = sanitizeFileName(documento.doc_nombre)
  const downloadAs = baseName.endsWith(extension) ? baseName : `${baseName}${extension}`

  const result = await getStorageProvider().getSignedUrl(
    'DOCUMENTOS_EMPLEADO',
    documento.doc_path,
    TTL_DESCARGA,
    { downloadAs }
  )

  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  return { ok: true, url: result.data }
}
