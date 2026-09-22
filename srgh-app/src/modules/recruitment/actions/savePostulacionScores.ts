'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { averageScore } from '@/modules/evaluations/lib/scoring'
import { guardarPuntajesSchema, type GuardarPuntajesInput } from '@/modules/recruitment/types'

export type SavePostulacionScoresResult =
  { ok: true; promedio: number | null } | { ok: false; error: string }

/**
 * Guarda el puntaje de una postulación por criterio y recalcula
 * pos_puntaje_promedio (denormalizado, para que el tablero pueda mostrar y
 * ordenar sin recalcular en cada carga). Reutiliza averageScore de
 * evaluations/lib/scoring.ts — la misma escala 0-10, sin nada atado a
 * empleados.
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

  const aplicables = parsed.data.puntajes.filter((p) => !p.noAplica && p.puntaje !== null)
  const promedio = averageScore(aplicables.map((p) => p.puntaje!))

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
