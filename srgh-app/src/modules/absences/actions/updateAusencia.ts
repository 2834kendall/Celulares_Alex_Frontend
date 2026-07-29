'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAusenciaSchema, type CreateAusenciaInput } from '@/modules/absences/types'
import { countDays } from '@/modules/absences/lib/dateRange'

export type UpdateAusenciaResult = { ok: true } | { ok: false; error: string }

export async function updateAusencia(
  ausenciaId: number,
  input: CreateAusenciaInput
): Promise<UpdateAusenciaResult> {
  const parsed = createAusenciaSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la ausencia invalidos.' }
  }

  // RLS de sgrh_ausencias exige AUSENCIAS_APPROVE para actualizar.
  await requirePermission(PERMISOS.AUSENCIAS_APPROVE)

  const data = parsed.data
  const supabase = await createClient()

  const { data: overlapping, error: errOverlap } = await supabase
    .from('sgrh_ausencias')
    .select('aus_id')
    .eq('aus_historial_laboral_id', data.employmentHistoryId)
    .lte('aus_fecha_inicio', data.fechaFin)
    .gte('aus_fecha_fin', data.fechaInicio)
    .neq('aus_id', ausenciaId)

  if (errOverlap) {
    return { ok: false, error: 'No se pudo validar el traslape de fechas.' }
  }

  if (overlapping && overlapping.length > 0) {
    return {
      ok: false,
      error: 'El colaborador ya tiene una ausencia registrada que se traslapa con esas fechas.',
    }
  }

  const { naturales, habiles } = countDays(data.fechaInicio, data.fechaFin)

  const { error } = await supabase
    .from('sgrh_ausencias')
    .update({
      aus_historial_laboral_id: data.employmentHistoryId,
      aus_tipo_ausencia_id: data.tipoAusenciaId,
      aus_fecha_inicio: data.fechaInicio,
      aus_fecha_fin: data.fechaFin,
      aus_dias_naturales: naturales,
      aus_dias_habiles: habiles,
      aus_numero_boleta_ccss: data.numeroBoletaCcss || null,
      aus_observaciones: data.observaciones || null,
    })
    .eq('aus_id', ausenciaId)

  if (error) {
    return { ok: false, error: 'No se pudo actualizar la ausencia.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
