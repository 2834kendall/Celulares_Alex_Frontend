'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  averageScore,
  classifyScore,
  formatPeriod,
  serializeNotes,
} from '@/modules/evaluations/lib/scoring'
import { evaluationSchema, type EvaluationInput } from '@/modules/evaluations/types'

export type CreateEvaluationResult = { ok: true; id: number } | { ok: false; error: string }

export async function createEvaluation(input: EvaluationInput): Promise<CreateEvaluationResult> {
  const parsed = evaluationSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la evaluacion invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.EVALUACIONES_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }

  if (!meta.empresa_id || !meta.usr_id) {
    return { ok: false, error: 'No se pudo determinar la sesion del evaluador.' }
  }

  const supabase = await createClient()

  // Valida que el colaborador pertenezca a la empresa y toma su sucursal.
  const { data: historial, error: historialError } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id, lab_sucursal_id')
    .eq('lab_id', parsed.data.labId)
    .eq('lab_empresa_id', meta.empresa_id)
    .single()

  if (historialError || !historial) {
    return { ok: false, error: 'El colaborador seleccionado no es valido.' }
  }

  const applicable = parsed.data.scores.filter((s) => !s.noAplica && s.puntaje !== null)
  const promedio = averageScore(applicable.map((s) => s.puntaje!))

  const { data: evaluacion, error: evalError } = await supabase
    .from('sgrh_evaluaciones')
    .insert({
      eve_empresa_id: meta.empresa_id,
      eve_tipo_evaluacion: parsed.data.tipo,
      eve_historial_laboral_id: historial.lab_id,
      eve_sucursal_id: historial.lab_sucursal_id,
      eve_evaluador_id: meta.usr_id,
      eve_fecha_evaluacion: new Date().toISOString().slice(0, 10),
      eve_tipo_periodo: formatPeriod(parsed.data.periodoInicio, parsed.data.periodoFin),
      eve_estado: 'completada',
      eve_promedio_final: promedio,
      eve_resultado_texto: promedio !== null ? classifyScore(promedio).label : null,
      eve_observaciones: serializeNotes({
        fortalezas: parsed.data.fortalezas,
        mejoras: parsed.data.mejoras,
        comentarios: parsed.data.comentarios,
      }),
    })
    .select('eve_id')
    .single()

  if (evalError || !evaluacion) {
    return { ok: false, error: 'No se pudo registrar la evaluacion.' }
  }

  const { error: resultsError } = await supabase.from('sgrh_evaluacion_resultados').insert(
    parsed.data.scores.map((s) => ({
      evr_evaluacion_id: evaluacion.eve_id,
      evr_criterio_id: s.criterioId,
      evr_puntaje: s.noAplica ? null : s.puntaje,
      evr_observacion: s.observacion || null,
      evr_no_aplica: s.noAplica,
    }))
  )

  if (resultsError) {
    // Sin resultados la evaluacion queda inconsistente: se revierte.
    await supabase.from('sgrh_evaluaciones').delete().eq('eve_id', evaluacion.eve_id)
    return { ok: false, error: 'No se pudieron guardar las calificaciones por rubro.' }
  }

  revalidatePath('/evaluations')
  return { ok: true, id: evaluacion.eve_id }
}
