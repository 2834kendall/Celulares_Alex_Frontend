'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { serializeNotes } from '@/modules/evaluations/lib/scoring'
import { evaluationNotesSchema, type EvaluationNotes } from '@/modules/evaluations/types'

export type UpdateEvaluationNotesResult = { ok: true } | { ok: false; error: string }

/*
  Actualiza las notas cualitativas (puntos fuertes, aspectos a mejorar y
  comentarios de liderazgo) de una evaluacion ya registrada.
 */
export async function updateEvaluationNotes(
  evaluationId: number,
  notes: EvaluationNotes
): Promise<UpdateEvaluationNotesResult> {
  const parsed = evaluationNotesSchema.safeParse(notes)

  if (!parsed.success || !Number.isInteger(evaluationId) || evaluationId <= 0) {
    return { ok: false, error: 'Datos de las notas invalidos.' }
  }

  await requirePermission(PERMISOS.EVALUACIONES_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_evaluaciones')
    .update({ eve_observaciones: serializeNotes(parsed.data) })
    .eq('eve_id', evaluationId)

  if (error) {
    return { ok: false, error: 'No se pudieron guardar las notas de la evaluacion.' }
  }

  revalidatePath('/evaluations')
  return { ok: true }
}
