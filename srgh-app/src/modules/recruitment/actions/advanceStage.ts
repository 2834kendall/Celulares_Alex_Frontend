'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { avanzarEtapaSchema, type AvanzarEtapaInput } from '@/modules/recruitment/types'

export type AdvanceStageResult = { ok: true } | { ok: false; error: string }

/**
 * Registra el paso de una postulación por una etapa del embudo. Llama a la
 * RPC registrar_etapa_postulacion (SECURITY INVOKER — la RLS de
 * sgrh_postulacion_etapas y sgrh_postulaciones sigue aplicando con el
 * permiso del usuario), que agrupa en una transacción el INSERT del
 * historial y el UPDATE de la etapa actual.
 */
export async function advanceStage(input: AvanzarEtapaInput): Promise<AdvanceStageResult> {
  const parsed = avanzarEtapaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos de la etapa inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)
  const meta = claims.app_metadata as { usr_id?: number }

  const supabase = await createClient()
  // p_notas / p_responsable_id tienen DEFAULT NULL en la función: se omiten
  // en vez de mandar null, porque el tipo generado los declara opcionales
  // (string/number), no nullable.
  const { error } = await supabase.rpc('registrar_etapa_postulacion', {
    p_postulacion_id: parsed.data.postulacionId,
    p_etapa_id: parsed.data.etapaId,
    p_resultado: parsed.data.resultado,
    p_fecha: parsed.data.fecha,
    ...(parsed.data.notas ? { p_notas: parsed.data.notas } : {}),
    ...(meta?.usr_id ? { p_responsable_id: meta.usr_id } : {}),
  })

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'No tienes permiso para avanzar esta postulación.' }
    }
    return { ok: false, error: 'No se pudo registrar la etapa.' }
  }

  revalidatePath('/recruitment')

  const { data: postulacion } = await supabase
    .from('sgrh_postulaciones')
    .select('pos_candidato_id')
    .eq('pos_id', parsed.data.postulacionId)
    .maybeSingle()
  if (postulacion) {
    revalidatePath(`/recruitment/candidates/${postulacion.pos_candidato_id}`)
  }

  return { ok: true }
}
