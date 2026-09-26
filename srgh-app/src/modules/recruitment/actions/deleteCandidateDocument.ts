'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'

export type DeleteCandidateDocumentResult = { ok: true } | { ok: false; error: string }

/**
 * Elimina definitivamente un documento de candidato. Mismo orden que
 * deleteEmployeeDocument.ts: la fila se borra PRIMERO (fuente de verdad),
 * el objeto en storage se limpia best-effort después.
 */
export async function deleteCandidateDocument(
  docId: number
): Promise<DeleteCandidateDocumentResult> {
  if (!Number.isInteger(docId) || docId <= 0) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)

  const supabase = await createClient()

  const { data: documento, error: documentoError } = await supabase
    .from('sgrh_candidato_documentos')
    .select('cdo_id, cdo_path, cdo_candidato_id')
    .eq('cdo_id', docId)
    .maybeSingle()

  if (documentoError || !documento) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  const { error: deleteError } = await supabase
    .from('sgrh_candidato_documentos')
    .delete()
    .eq('cdo_id', docId)

  if (deleteError) {
    return { ok: false, error: 'No se pudo eliminar el documento.' }
  }

  const removed = await getStorageProvider().remove('CV_CANDIDATO', [documento.cdo_path])
  if (!removed.ok) {
    console.error(
      `deleteCandidateDocument: no se pudo borrar el objeto en storage (path=${documento.cdo_path})`
    )
  }

  revalidatePath(`/recruitment/candidates/${documento.cdo_candidato_id}`)
  return { ok: true }
}
