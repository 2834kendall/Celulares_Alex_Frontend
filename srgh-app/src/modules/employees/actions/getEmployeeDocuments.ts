'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { DocumentoEmpleado } from '@/modules/employees/types'

interface DocumentoQueryRow {
  doc_id: number
  doc_empleado_id: number
  doc_tipo_id: number
  doc_nombre: string
  doc_descripcion: string | null
  doc_fecha_vencimiento: string | null
  doc_mime: string
  doc_created_at: string
  sgrh_cat_tipos_documento: { tdo_nombre: string } | null
}

export type GetEmployeeDocumentsResult =
  { ok: true; data: DocumentoEmpleado[] } | { ok: false; error: string }

/**
 * Documentos del expediente de un empleado (SGRH-67, fase 2B). RLS ya limita
 * las filas a la empresa del usuario; aquí solo se exige el permiso de
 * dominio y se filtra por empleado.
 */
export async function getEmployeeDocuments(empId: number): Promise<GetEmployeeDocumentsResult> {
  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  await requirePermission(PERMISOS.DOCUMENTOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_documentos')
    .select(
      `
      doc_id,
      doc_empleado_id,
      doc_tipo_id,
      doc_nombre,
      doc_descripcion,
      doc_fecha_vencimiento,
      doc_mime,
      doc_created_at,
      sgrh_cat_tipos_documento ( tdo_nombre )
    `
    )
    .eq('doc_empleado_id', empId)
    .order('doc_created_at', { ascending: false })
    .returns<DocumentoQueryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los documentos.' }
  }

  const documentos: DocumentoEmpleado[] = (data ?? []).map((row) => {
    const { sgrh_cat_tipos_documento, ...base } = row
    return { ...base, tipo_nombre: sgrh_cat_tipos_documento?.tdo_nombre ?? '—' }
  })

  return { ok: true, data: documentos }
}
