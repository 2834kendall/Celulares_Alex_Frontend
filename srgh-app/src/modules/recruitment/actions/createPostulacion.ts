'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { postulacionSchema, type PostulacionInput } from '@/modules/recruitment/types'

export type CreatePostulacionResult =
  { ok: true; postulacionId: number } | { ok: false; error: string }

/**
 * Nueva postulación para un candidato QUE YA EXISTE (encontrado por
 * búsqueda) — por ejemplo, alguien que vuelve a aplicar a otro puesto. Para
 * el alta combinada (candidato nuevo + primera postulación) ver
 * createCandidateWithPostulacion.ts.
 */
export async function createPostulacion(
  candidatoId: number,
  input: PostulacionInput
): Promise<CreatePostulacionResult> {
  if (!Number.isInteger(candidatoId) || candidatoId <= 0) {
    return { ok: false, error: 'Candidato no encontrado.' }
  }

  const parsed = postulacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos de la postulación inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number }
  const empresaId = meta?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // Cross-tenant antes de insertar: un candidato de otra empresa "no existe"
  // bajo RLS, mismo criterio que addEmployeeDocument con empId.
  const { data: candidato, error: candidatoError } = await supabase
    .from('sgrh_candidatos')
    .select('cdt_id')
    .eq('cdt_id', candidatoId)
    .maybeSingle()

  if (candidatoError || !candidato) {
    return { ok: false, error: 'Candidato no encontrado.' }
  }

  const { data: postulacion, error: postulacionError } = await supabase
    .from('sgrh_postulaciones')
    .insert({ ...parsed.data, pos_candidato_id: candidatoId, pos_empresa_id: empresaId })
    .select('pos_id')
    .single()

  if (postulacionError || !postulacion) {
    return { ok: false, error: 'No se pudo registrar la postulación.' }
  }

  revalidatePath('/recruitment')
  revalidatePath(`/recruitment/candidates/${candidatoId}`)
  return { ok: true, postulacionId: postulacion.pos_id }
}
