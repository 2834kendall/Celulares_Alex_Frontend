'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { buildEmployeeDocumentPath } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'
import { documentoMetadataSchema } from '@/modules/employees/types'

export type AddEmployeeDocumentResult = { ok: true; docId: number } | { ok: false; error: string }

/**
 * Agrega un documento al expediente de un empleado (SGRH-67, fase 2B). El
 * archivo y su metadata viajan por FormData; toda la validación real es
 * server-side (magic bytes, jamás file.type) y la ruta se construye SIEMPRE
 * con el empresa_id del JWT.
 *
 * Orden deliberado (igual que setEmployeePhoto): 1) subir el objeto nuevo,
 * 2) insertar la fila de metadata — si el insert falla, se revierte el
 * upload para no dejar un objeto huérfano apuntado por nadie.
 */
export async function addEmployeeDocument(
  empId: number,
  formData: FormData
): Promise<AddEmployeeDocumentResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  const metadataCandidate = {
    doc_nombre: formData.get('doc_nombre'),
    doc_tipo_id: Number(formData.get('doc_tipo_id')),
    doc_descripcion: formData.get('doc_descripcion') ?? '',
    doc_fecha_vencimiento: formData.get('doc_fecha_vencimiento') ?? '',
  }
  const parsed = documentoMetadataSchema.safeParse(metadataCandidate)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del documento inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.DOCUMENTOS_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }
  const empresaId = meta?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // Cross-tenant ANTES de tocar el proveedor: mismo criterio que
  // setEmployeePhoto — un empId ajeno "no existe" bajo RLS.
  const { data: empleado, error: empleadoError } = await supabase
    .from('sgrh_empleados')
    .select('emp_id')
    .eq('emp_id', empId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'DOCUMENTOS_EMPLEADO')
  if (!check.ok) {
    return { ok: false, error: storageErrorMessage(check.error) }
  }

  const provider = getStorageProvider()
  const path = buildEmployeeDocumentPath(empresaId, empId, check.extension)
  const uploaded = await provider.upload({
    container: 'DOCUMENTOS_EMPLEADO',
    path,
    body: bytes,
    contentType: check.mimeType,
  })

  if (!uploaded.ok) {
    return { ok: false, error: storageErrorMessage(uploaded.error) }
  }

  const newPath = uploaded.data.path

  const { data: inserted, error: insertError } = await supabase
    .from('sgrh_documentos')
    .insert({
      doc_empresa_id: empresaId,
      doc_empleado_id: empId,
      doc_tipo_id: parsed.data.doc_tipo_id,
      doc_nombre: parsed.data.doc_nombre,
      doc_descripcion: parsed.data.doc_descripcion ?? null,
      doc_fecha_vencimiento: parsed.data.doc_fecha_vencimiento ?? null,
      doc_path: newPath,
      doc_mime: check.mimeType,
      doc_creado_por: meta?.usr_id ?? null,
    })
    .select('doc_id')
    .single()

  if (insertError || !inserted) {
    // Nadie llegó a referenciar el objeto recién subido: se revierte.
    await provider.remove('DOCUMENTOS_EMPLEADO', [newPath])
    return { ok: false, error: 'No se pudo guardar el documento.' }
  }

  revalidatePath(`/employees/${empId}`)
  return { ok: true, docId: inserted.doc_id }
}
