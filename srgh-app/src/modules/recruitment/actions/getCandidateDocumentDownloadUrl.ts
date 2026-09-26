'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_DESCARGA } from '@/lib/storage/containers'
import { pathBelongsToEmpresa, sanitizeFileName } from '@/lib/storage/paths'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type GetCandidateDocumentDownloadUrlResult =
  { ok: true; url: string } | { ok: false; error: string }

/**
 * Firma la descarga FORZADA de un documento de candidato: TTL de 60 s +
 * downloadAs. Mismo patrón que getEmployeeDocumentDownloadUrl.ts — el path
 * nunca viaja al cliente, se firma por docId y el servidor lee el path de
 * sgrh_candidato_documentos.
 */
export async function getCandidateDocumentDownloadUrl(
  docId: number
): Promise<GetCandidateDocumentDownloadUrlResult> {
  if (!Number.isInteger(docId) || docId <= 0) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data: documento, error: documentoError } = await supabase
    .from('sgrh_candidato_documentos')
    .select('cdo_path, cdo_nombre')
    .eq('cdo_id', docId)
    .maybeSingle()

  if (documentoError || !documento) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  if (!pathBelongsToEmpresa(documento.cdo_path, empresaId)) {
    return { ok: false, error: storageErrorMessage('FORBIDDEN') }
  }

  const extension = documento.cdo_path.slice(documento.cdo_path.lastIndexOf('.'))
  const baseName = sanitizeFileName(documento.cdo_nombre)
  const downloadAs = baseName.endsWith(extension) ? baseName : `${baseName}${extension}`

  const result = await getStorageProvider().getSignedUrl(
    'CV_CANDIDATO',
    documento.cdo_path,
    TTL_DESCARGA,
    { downloadAs }
  )

  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  return { ok: true, url: result.data }
}
