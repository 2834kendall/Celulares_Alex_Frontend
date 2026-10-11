'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { weightedAverageScore } from '@/modules/recruitment/lib/scoring'
import { guardarPuntajesSchema, type GuardarPuntajesInput } from '@/modules/recruitment/types'

export type SavePostulacionScoresResult =
  { ok: true; promedio: number | null } | { ok: false; error: string }

/**
 * Guarda el puntaje de una postulación por criterio y recalcula
 * pos_puntaje_promedio (denormalizado, para que el tablero pueda mostrar y
 * ordenar sin recalcular en cada carga).
 *
 * El promedio es PONDERADO por are_peso (ver recruitment/lib/scoring.ts).
 * Los pesos se leen de la base acá adentro y NO se aceptan del cliente: si
 * viajaran en el formulario, cualquiera podría mandar un peso inflado en el
 * criterio donde su candidato salió mejor y torcer el promedio.
 *
 * upsert por (psc_postulacion_id, psc_criterio_id): re-calificar un
 * criterio actualiza la fila en vez de duplicarla (UNIQUE en la tabla).
 */
export async function savePostulacionScores(
  input: GuardarPuntajesInput
): Promise<SavePostulacionScoresResult> {
  const parsed = guardarPuntajesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del puntaje inválidos.' }
  }

  await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)

  const supabase = await createClient()

  const { error: upsertError } = await supabase.from('sgrh_postulacion_puntajes').upsert(
    parsed.data.puntajes.map((p) => ({
      psc_postulacion_id: parsed.data.postulacionId,
      psc_criterio_id: p.criterioId,
      psc_puntaje: p.noAplica ? null : p.puntaje,
      psc_no_aplica: p.noAplica,
      psc_observacion: p.observacion,
    })),
    { onConflict: 'psc_postulacion_id,psc_criterio_id' }
  )

  if (upsertError) {
    return { ok: false, error: 'No se pudo guardar el puntaje.' }
  }

  // Pesos desde la base (ver nota de seguridad arriba). Un criterio que ya
  // no esté en el catálogo activo cae a peso 1 en vez de romper el guardado.
  const { data: criterios, error: criteriosError } = await supabase
    .from('sgrh_cat_criterios_seleccion')
    .select('cri_id, sgrh_cat_areas_seleccion ( are_peso )')
    .in(
      'cri_id',
      parsed.data.puntajes.map((p) => p.criterioId)
    )
    .returns<{ cri_id: number; sgrh_cat_areas_seleccion: { are_peso: number } | null }[]>()

  if (criteriosError) {
    return { ok: false, error: 'Los puntajes se guardaron, pero no se pudo calcular el promedio.' }
  }

  const pesoPorCriterio = new Map(
    (criterios ?? []).map((c) => [c.cri_id, c.sgrh_cat_areas_seleccion?.are_peso ?? 1])
  )

  const promedio = weightedAverageScore(
    parsed.data.puntajes.map((p) => ({
      puntaje: p.noAplica ? null : p.puntaje,
      peso: pesoPorCriterio.get(p.criterioId) ?? 1,
    }))
  )

  const { data: postulacion, error: updateError } = await supabase
    .from('sgrh_postulaciones')
    .update({ pos_puntaje_promedio: promedio })
    .eq('pos_id', parsed.data.postulacionId)
    .select('pos_candidato_id')
    .maybeSingle()

  if (updateError) {
    // El detalle por criterio ya quedó guardado; solo el promedio
    // denormalizado no se pudo actualizar — no revierte los puntajes, se
    // recalcula solo en el próximo guardado.
    return {
      ok: false,
      error: 'Los puntajes se guardaron, pero no se pudo actualizar el promedio.',
    }
  }

  revalidatePath('/recruitment')
  if (postulacion) {
    revalidatePath(`/recruitment/candidates/${postulacion.pos_candidato_id}`)
  }

  return { ok: true, promedio }
}
