'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { buildCandidateDocumentPath } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'
import { candidatoDocumentoMetadataSchema } from '@/modules/recruitment/types'

export type AddCandidateDocumentResult = { ok: true; docId: number } | { ok: false; error: string }

/**
 * Agrega un documento al candidato (CV, cédula, referencias, títulos).
 * Mismo patrón que addEmployeeDocument.ts: el archivo y su metadata viajan
 * por FormData, la validación real es server-side (magic bytes, jamás
 * file.type), y la ruta se construye SIEMPRE con el empresa_id del JWT.
 *
 * Orden deliberado: 1) subir el objeto nuevo, 2) insertar la fila de
 * metadata — si el insert falla, se revierte el upload para no dejar un
 * objeto huérfano apuntado por nadie.
 */
export async function addCandidateDocument(
  candidatoId: number,
  formData: FormData
): Promise<AddCandidateDocumentResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  if (!Number.isInteger(candidatoId) || candidatoId <= 0) {
    return { ok: false, error: 'Candidato no encontrado.' }
  }

  const metadataCandidate = {
    cdo_tipo: formData.get('cdo_tipo'),
    cdo_nombre: formData.get('cdo_nombre'),
  }
  const parsed = candidatoDocumentoMetadataSchema.safeParse(metadataCandidate)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del documento inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }
  const empresaId = meta?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // Cross-tenant ANTES de tocar el proveedor: un candidatoId ajeno "no
  // existe" bajo RLS, mismo criterio que addEmployeeDocument con empId.
  const { data: candidato, error: candidatoError } = await supabase
    .from('sgrh_candidatos')
    .select('cdt_id')
    .eq('cdt_id', candidatoId)
    .maybeSingle()

  if (candidatoError || !candidato) {
    return { ok: false, error: 'Candidato no encontrado.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'CV_CANDIDATO')
  if (!check.ok) {
    return { ok: false, error: storageErrorMessage(check.error) }
  }

  const provider = getStorageProvider()
  const path = buildCandidateDocumentPath(empresaId, candidatoId, check.extension)
  const uploaded = await provider.upload({
    container: 'CV_CANDIDATO',
    path,
    body: bytes,
    contentType: check.mimeType,
  })

  if (!uploaded.ok) {
    return { ok: false, error: storageErrorMessage(uploaded.error) }
  }

  const newPath = uploaded.data.path

  const { data: inserted, error: insertError } = await supabase
    .from('sgrh_candidato_documentos')
    .insert({
      cdo_empresa_id: empresaId,
      cdo_candidato_id: candidatoId,
      cdo_tipo: parsed.data.cdo_tipo,
      cdo_nombre: parsed.data.cdo_nombre,
      cdo_path: newPath,
      cdo_mime: check.mimeType,
      cdo_creado_por: meta?.usr_id ?? null,
    })
    .select('cdo_id')
    .single()

  if (insertError || !inserted) {
    // Nadie llegó a referenciar el objeto recién subido: se revierte.
    await provider.remove('CV_CANDIDATO', [newPath])
    return { ok: false, error: 'No se pudo guardar el documento.' }
  }

  revalidatePath(`/recruitment/candidates/${candidatoId}`)
  return { ok: true, docId: inserted.cdo_id }
}
