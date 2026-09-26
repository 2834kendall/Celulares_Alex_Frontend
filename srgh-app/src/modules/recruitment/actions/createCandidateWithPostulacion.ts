'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { mapRecruitmentUniqueError } from '@/modules/recruitment/lib/dbErrors'
import { nuevoCandidatoSchema, type NuevoCandidatoInput } from '@/modules/recruitment/types'

export type CreateCandidateWithPostulacionResult =
  { ok: true; candidatoId: number; postulacionId: number } | { ok: false; error: string }

/**
 * Alta del botón "Nuevo candidato" del tablero: candidato + primera
 * postulación en un solo submit. No hay una RPC atómica para esto (a
 * diferencia de crear_empleado_completo) porque el riesgo es bajo — un
 * candidato sin postulación es, a lo sumo, una fila huérfana visible solo
 * para RRHH de la misma empresa — pero igual se revierte el candidato si
 * la postulación falla, mismo criterio que createRubro.ts en evaluations.
 */
export async function createCandidateWithPostulacion(
  input: NuevoCandidatoInput
): Promise<CreateCandidateWithPostulacionResult> {
  const parsed = nuevoCandidatoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del candidato inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number }
  const empresaId = meta?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data: candidato, error: candidatoError } = await supabase
    .from('sgrh_candidatos')
    .insert({ ...parsed.data.candidato, cdt_empresa_id: empresaId })
    .select('cdt_id')
    .single()

  if (candidatoError || !candidato) {
    const mensaje = mapRecruitmentUniqueError(candidatoError)
    return { ok: false, error: mensaje ?? 'No se pudo registrar el candidato.' }
  }

  const { data: postulacion, error: postulacionError } = await supabase
    .from('sgrh_postulaciones')
    .insert({
      ...parsed.data.postulacion,
      pos_candidato_id: candidato.cdt_id,
      pos_empresa_id: empresaId,
    })
    .select('pos_id')
    .single()

  if (postulacionError || !postulacion) {
    // Sin postulación el candidato queda huérfano en el tablero: se revierte.
    await supabase.from('sgrh_candidatos').delete().eq('cdt_id', candidato.cdt_id)
    return { ok: false, error: 'No se pudo registrar la postulación.' }
  }

  revalidatePath('/recruitment')
  return { ok: true, candidatoId: candidato.cdt_id, postulacionId: postulacion.pos_id }
}
