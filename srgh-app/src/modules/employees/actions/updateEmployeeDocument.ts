'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { documentoMetadataSchema, type DocumentoMetadataInput } from '@/modules/employees/types'

export type UpdateEmployeeDocumentResult = { ok: true } | { ok: false; error: string }

/** Edita la metadata de un documento del expediente (SGRH-67, fase 2B). */
export async function updateEmployeeDocument(
  docId: number,
  input: DocumentoMetadataInput
): Promise<UpdateEmployeeDocumentResult> {
  if (!Number.isInteger(docId) || docId <= 0) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  const parsed = documentoMetadataSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del documento inválidos.' }
  }

  await requirePermission(PERMISOS.DOCUMENTOS_WRITE)

  const supabase = await createClient()

  // Cross-tenant: RLS deja ver solo documentos de la empresa del JWT, así que
  // un docId ajeno "no existe" para este usuario.
  const { data: documento, error: documentoError } = await supabase
    .from('sgrh_documentos')
    .select('doc_id, doc_empleado_id')
    .eq('doc_id', docId)
    .maybeSingle()

  if (documentoError || !documento) {
    return { ok: false, error: 'Documento no encontrado.' }
  }

  const { error: updateError } = await supabase
    .from('sgrh_documentos')
    .update({
      doc_nombre: parsed.data.doc_nombre,
      doc_tipo_id: parsed.data.doc_tipo_id,
      doc_descripcion: parsed.data.doc_descripcion ?? null,
      doc_fecha_vencimiento: parsed.data.doc_fecha_vencimiento ?? null,
    })
    .eq('doc_id', docId)

  if (updateError) {
    return { ok: false, error: 'No se pudo actualizar el documento.' }
  }

  revalidatePath(`/employees/${documento.doc_empleado_id}`)
  return { ok: true }
}
