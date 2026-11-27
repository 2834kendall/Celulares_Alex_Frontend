'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createClient } from '@/lib/supabase/server'
import { createAusencia } from '@/modules/absences/actions/createAusencia'
import { absencePaidFraction } from '@/modules/attendance/lib/absencePaidFraction'
import { bloquesDelDia } from '@/modules/attendance/lib/dayJourney'
import { justifySecondBlockSchema, type JustifySecondBlockInput } from '@/modules/attendance/types'

type JustifySecondBlockResult = { ok: true } | { ok: false; error: string }

export async function justifySecondBlock(
  input: JustifySecondBlockInput
): Promise<JustifySecondBlockResult> {
  const parsed = justifySecondBlockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos de la justificación inválidos.' }

  const claims = await requirePermission(PERMISOS.AUSENCIAS_APPROVE)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }
  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const { employmentHistoryId, date, tipoAusenciaId, motivo } = parsed.data
  const supabase = await createClient()
  const [schedule, { data: type, error: typeError }] = await Promise.all([
    bloquesDelDia(supabase, employmentHistoryId, date),
    supabase
      .from('sgrh_cat_tipos_ausencia')
      .select('tau_requiere_documento_ccss, tau_porcentaje_pago_empleador, tau_es_intradia')
      .eq('tau_id', tipoAusenciaId)
      .maybeSingle(),
  ])

  if (typeError || !type || type.tau_es_intradia) {
    return { ok: false, error: 'Seleccioná un tipo de ausencia válido para el bloque.' }
  }
  if (!schedule.ok) return schedule
  const secondBlock = schedule.bloques[1]
  if (!secondBlock) return { ok: false, error: 'No se encontró el 2.º bloque programado.' }

  const paidFraction = absencePaidFraction(type)
  if (paidFraction > 0) {
    return createAusencia({
      employmentHistoryId,
      tipoAusenciaId,
      fechaInicio: date,
      fechaFin: date,
      observaciones: motivo,
    })
  }

  const { error } = await supabase.from('sgrh_justificaciones_bloque').insert({
    jbl_empresa_id: meta.empresa_id,
    jbl_historial_laboral_id: employmentHistoryId,
    jbl_sucursal_id: secondBlock.branchId,
    jbl_fecha: date,
    jbl_bloque: 2,
    jbl_tipo_ausencia_id: tipoAusenciaId,
    jbl_fraccion_pagada: paidFraction,
    jbl_motivo: motivo || null,
    jbl_registrado_por_id: meta.usr_id ?? null,
  })

  if (error?.code === '23505') {
    return { ok: false, error: 'El 2.º bloque ya tiene una justificación.' }
  }
  if (error) return { ok: false, error: 'No se pudo justificar el 2.º bloque.' }

  revalidatePath('/attendance')
  return { ok: true }
}
