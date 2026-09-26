'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { avanzarEtapaSchema, type AvanzarEtapaInput } from '@/modules/recruitment/types'
import { isForward } from '@/modules/recruitment/lib/stages'

export type AdvanceStageResult = { ok: true } | { ok: false; error: string }

interface PostulacionActualRow {
  pos_candidato_id: number
  pos_estado_final: string
  sgrh_cat_etapas_seleccion: { eta_fase: number | null; eta_orden: number } | null
}

interface EtapaDestinoRow {
  eta_fase: number | null
  eta_orden: number
  eta_activo: boolean
}

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

  // Solo hacia adelante (decisión de RRHH): la pantalla ya ofrece solo las
  // etapas posteriores, pero la regla se valida acá también para que no
  // dependa de la UI. Mismo orden que la pantalla: lib/stages.ts.
  const [{ data: postulacion }, { data: destino }] = await Promise.all([
    supabase
      .from('sgrh_postulaciones')
      .select(
        'pos_candidato_id, pos_estado_final, sgrh_cat_etapas_seleccion ( eta_fase, eta_orden )'
      )
      .eq('pos_id', parsed.data.postulacionId)
      .maybeSingle<PostulacionActualRow>(),
    supabase
      .from('sgrh_cat_etapas_seleccion')
      .select('eta_fase, eta_orden, eta_activo')
      .eq('eta_id', parsed.data.etapaId)
      .maybeSingle<EtapaDestinoRow>(),
  ])

  if (!postulacion) {
    return { ok: false, error: 'Postulación no encontrada.' }
  }
  if (postulacion.pos_estado_final !== 'en_proceso') {
    return { ok: false, error: 'La postulación ya está cerrada.' }
  }
  if (!destino || !destino.eta_activo) {
    return { ok: false, error: 'Esa etapa ya no está disponible.' }
  }

  const actual = postulacion.sgrh_cat_etapas_seleccion
  if (
    !isForward(actual ? { fase: actual.eta_fase ?? 1, orden: actual.eta_orden } : null, {
      fase: destino.eta_fase ?? 1,
      orden: destino.eta_orden,
    })
  ) {
    return { ok: false, error: 'Solo se puede avanzar a una etapa posterior a la actual.' }
  }
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
  revalidatePath(`/recruitment/candidates/${postulacion.pos_candidato_id}`)

  return { ok: true }
}
