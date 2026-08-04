'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { sincronizarAusenciaEnNomina } from '@/modules/payroll/lib/ausenciaNominaSync'
import {
  registrarIncapacidadSchema,
  type RegistrarIncapacidadInput,
  type RegistrarIncapacidadResult,
} from '@/modules/payroll/types'

interface HistorialRow {
  lab_id: number
  lab_fecha_fin: string | null
}

interface TipoAusenciaRow {
  tau_id: number
  tau_paga_empleador_dias: number
  tau_porcentaje_pago_empleador: number
}

/**
 * Registra una incapacidad por enfermedad (INC_ENF) para un empleado y
 * reparte sus días entre los periodos de nómina que se traslapan con su
 * rango de fechas — respetando que el patrono no paga más de
 * tau_paga_empleador_dias días POR MES CALENDARIO (sumando lo que ya se
 * hubiera pagado en otros periodos del mismo mes, tocados o no por esta
 * incapacidad).
 *
 * No modifica ndt_salario_bruto: el monto de la incapacidad se calcula al
 * mostrarla (días_empleador × salario diario × % del catálogo), nunca se
 * suma al bruto — así no infla aguinaldo, vacaciones ni liquidación.
 */
export async function registrarIncapacidad(
  input: RegistrarIncapacidadInput
): Promise<RegistrarIncapacidadResult> {
  // La RLS de sgrh_ausencias exige AUSENCIAS_APPROVE para insertar a nombre
  // de otro empleado; la de sgrh_nomina_detalle exige NOMINA_WRITE para
  // actualizar los días de incapacidad. Hacen falta los dos.
  await requirePermission(PERMISOS.NOMINA_WRITE)
  await requirePermission(PERMISOS.AUSENCIAS_APPROVE)

  const parsed = registrarIncapacidadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const data = parsed.data

  const supabase = await createClient()

  const [{ data: historial, error: errHistorial }, { data: tipoAusencia, error: errTipo }] =
    await Promise.all([
      supabase
        .from('sgrh_historial_laboral')
        .select('lab_id, lab_fecha_fin')
        .eq('lab_id', data.historialLaboralId)
        .maybeSingle<HistorialRow>(),
      supabase
        .from('sgrh_cat_tipos_ausencia')
        .select('tau_id, tau_paga_empleador_dias, tau_porcentaje_pago_empleador')
        .eq('tau_codigo', 'INC_ENF')
        .maybeSingle<TipoAusenciaRow>(),
    ])

  if (errHistorial) {
    return { ok: false, error: 'No se pudo cargar el historial laboral del empleado.' }
  }
  if (!historial) {
    return { ok: false, error: 'El empleado no existe o no es visible.' }
  }
  if (historial.lab_fecha_fin) {
    return { ok: false, error: 'Este empleado ya tiene una salida registrada.' }
  }
  if (errTipo || !tipoAusencia) {
    return {
      ok: false,
      error:
        'No se encontró el tipo de ausencia "Incapacidad por Enfermedad" (INC_ENF) en el catálogo.',
    }
  }

  const { error: errInsert } = await supabase.from('sgrh_ausencias').insert({
    aus_historial_laboral_id: data.historialLaboralId,
    aus_tipo_ausencia_id: tipoAusencia.tau_id,
    aus_fecha_inicio: data.fechaInicio,
    aus_fecha_fin: data.fechaFin,
    aus_numero_boleta_ccss: data.numeroBoletaCcss,
    // Se registra directo desde nómina por alguien con permiso de aprobar
    // ausencias, así que entra ya aprobada (no queda pendiente de revisión).
    aus_estado: 'aprobada',
  })

  if (errInsert) {
    return { ok: false, error: 'No se pudo guardar la incapacidad.' }
  }

  const sync = await sincronizarAusenciaEnNomina(supabase, {
    historialLaboralId: data.historialLaboralId,
    fechaInicio: data.fechaInicio,
    fechaFin: data.fechaFin,
    topeMensualEmpleador: tipoAusencia.tau_paga_empleador_dias,
  })

  if (!sync.ok) {
    // La incapacidad ya quedó guardada (para el historial); solo no se pudo
    // repartir en la planilla. Se avisa para que se revise a mano.
    return { ok: false, error: `La incapacidad se guardó. ${sync.error}` }
  }

  revalidatePath('/payroll')
  for (const p of sync.periodosActualizados) {
    revalidatePath(`/payroll/${p.periodoId}`)
  }

  return {
    ok: true,
    periodosActualizados: sync.periodosActualizados,
    diasSinPeriodo: sync.diasSinPeriodo,
  }
}
