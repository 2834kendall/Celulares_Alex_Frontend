'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'

export type DeleteEmployeeDocumentResult = { ok: true } | { ok: false; error: string }

/**
 * Elimina definitivamente un documento del expediente (SGRH-67, fase 2B).
 * Borrado sin confirmación previa a nivel de servidor: la UI ya la pide con
 * ConfirmDialog antes de llamar esta acción.
 *
 * La fila se borra PRIMERO (fuente de verdad — mismo criterio que
 * removeEmployeePhoto): el objeto en storage se limpia best-effort después;
 * si falla, solo queda un huérfano inofensivo en un bucket privado.
 */
export async function deleteEmployeeDocument(docId: number): Promise<DeleteEmployeeDocumentResult> {
  if (!Number.isInteger(docId) || docId <= 0) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  await requirePermission(PERMISOS.DOCUMENTOS_WRITE)

  const supabase = await createClient()

  const { data: documento, error: documentoError } = await supabase
    .from('sgrh_documentos')
    .select('doc_id, doc_path, doc_empleado_id')
    .eq('doc_id', docId)
    .maybeSingle()

  if (documentoError || !documento) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  const { error: deleteError } = await supabase.from('sgrh_documentos').delete().eq('doc_id', docId)

  if (deleteError) {
    return { ok: false, error: 'No se pudo eliminar el documento.' }
  }

  const removed = await getStorageProvider().remove('DOCUMENTOS_EMPLEADO', [documento.doc_path])
  if (!removed.ok) {
    console.error(
      `deleteEmployeeDocument: no se pudo borrar el objeto en storage (path=${documento.doc_path})`
    )
  }

  revalidatePath(`/employees/${documento.doc_empleado_id}`)
  return { ok: true }
}
