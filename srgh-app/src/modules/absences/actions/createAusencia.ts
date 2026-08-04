'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAusenciaSchema, type CreateAusenciaInput } from '@/modules/absences/types'
import { countDays } from '@/modules/absences/lib/dateRange'
import { sincronizarAusenciaEnNomina } from '@/modules/payroll/lib/ausenciaNominaSync'

interface TipoAusenciaPagoRow {
  tau_paga_empleador_dias: number
  tau_es_intradia: boolean
}

export type CreateAusenciaResult = { ok: true } | { ok: false; error: string }

export async function createAusencia(input: CreateAusenciaInput): Promise<CreateAusenciaResult> {
  const parsed = createAusenciaSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la ausencia invalidos.' }
  }

  // RLS de sgrh_ausencias exige AUSENCIAS_APPROVE para insertar a nombre de otro colaborador.
  await requirePermission(PERMISOS.AUSENCIAS_APPROVE)

  const data = parsed.data
  const supabase = await createClient()

  const { data: overlapping, error: errOverlap } = await supabase
    .from('sgrh_ausencias')
    .select('aus_id')
    .eq('aus_historial_laboral_id', data.employmentHistoryId)
    .lte('aus_fecha_inicio', data.fechaFin)
    .gte('aus_fecha_fin', data.fechaInicio)

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

  const { error } = await supabase.from('sgrh_ausencias').insert({
    aus_historial_laboral_id: data.employmentHistoryId,
    aus_tipo_ausencia_id: data.tipoAusenciaId,
    aus_fecha_inicio: data.fechaInicio,
    aus_fecha_fin: data.fechaFin,
    aus_dias_naturales: naturales,
    aus_dias_habiles: habiles,
    aus_estado: 'aprobada',
    aus_numero_boleta_ccss: data.numeroBoletaCcss || null,
    aus_observaciones: data.observaciones || null,
  })

  if (error) {
    return { ok: false, error: 'No se pudo registrar la ausencia.' }
  }

  // Si el tipo afecta el pago (no es un permiso intradia como lactancia), se
  // reparte automáticamente en los periodos de nómina que se traslapan con
  // estas fechas. Mejor esfuerzo: si falla, la ausencia ya quedó guardada
  // igual.
  const { data: tipo } = await supabase
    .from('sgrh_cat_tipos_ausencia')
    .select('tau_paga_empleador_dias, tau_es_intradia')
    .eq('tau_id', data.tipoAusenciaId)
    .maybeSingle<TipoAusenciaPagoRow>()

  if (tipo && !tipo.tau_es_intradia) {
    await sincronizarAusenciaEnNomina(supabase, {
      historialLaboralId: data.employmentHistoryId,
      fechaInicio: data.fechaInicio,
      fechaFin: data.fechaFin,
      topeMensualEmpleador: tipo.tau_paga_empleador_dias,
    })
    revalidatePath('/payroll')
  }

  revalidatePath('/schedule')
  return { ok: true }
}
