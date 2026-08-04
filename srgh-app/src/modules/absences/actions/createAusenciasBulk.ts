'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAusenciasBulkSchema, type CreateAusenciasBulkInput } from '@/modules/absences/types'
import { countDays } from '@/modules/absences/lib/dateRange'
import { sincronizarAusenciaEnNomina } from '@/modules/payroll/lib/ausenciaNominaSync'

interface TipoAusenciaPagoRow {
  tau_paga_empleador_dias: number
  tau_es_intradia: boolean
}

export type CreateAusenciasBulkResult = { ok: true } | { ok: false; error: string }

interface DateRange {
  fechaInicio: string
  fechaFin: string
}

/** Dos rangos se traslapan si cada uno empieza antes de que el otro termine. */
function overlaps(a: DateRange, b: DateRange) {
  return a.fechaInicio <= b.fechaFin && a.fechaFin >= b.fechaInicio
}

/** Primer par de periodos del formulario que se pisan entre si. */
function findSelfOverlap(ranges: DateRange[]) {
  const sorted = [...ranges].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
  for (let i = 1; i < sorted.length; i++) {
    if (overlaps(sorted[i - 1], sorted[i])) return sorted[i]
  }
  return null
}

/**
 * Registra de una sola vez todos los periodos de una incapacidad o licencia.
 * El insert lleva las filas en un unico statement, de modo que o entran todos
 * los periodos o no entra ninguno.
 */
export async function createAusenciasBulk(
  input: CreateAusenciasBulkInput
): Promise<CreateAusenciasBulkResult> {
  const parsed = createAusenciasBulkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la ausencia invalidos.' }
  }

  // RLS de sgrh_ausencias exige AUSENCIAS_APPROVE para insertar a nombre de otro colaborador.
  await requirePermission(PERMISOS.AUSENCIAS_APPROVE)

  const data = parsed.data

  if (findSelfOverlap(data.ranges)) {
    return { ok: false, error: 'Hay periodos que se traslapan entre si. Revise las fechas.' }
  }

  const supabase = await createClient()

  // Una sola consulta cubre el tramo completo; el traslape fino se compara aca
  // porque los periodos pueden no ser continuos.
  const minInicio = data.ranges.reduce(
    (min, r) => (r.fechaInicio < min ? r.fechaInicio : min),
    data.ranges[0].fechaInicio
  )
  const maxFin = data.ranges.reduce(
    (max, r) => (r.fechaFin > max ? r.fechaFin : max),
    data.ranges[0].fechaFin
  )

  const { data: existing, error: errOverlap } = await supabase
    .from('sgrh_ausencias')
    .select('aus_fecha_inicio, aus_fecha_fin')
    .eq('aus_historial_laboral_id', data.employmentHistoryId)
    .lte('aus_fecha_inicio', maxFin)
    .gte('aus_fecha_fin', minInicio)

  if (errOverlap) {
    return { ok: false, error: 'No se pudo validar el traslape de fechas.' }
  }

  const registered = (existing ?? []).map((row) => ({
    fechaInicio: row.aus_fecha_inicio,
    fechaFin: row.aus_fecha_fin,
  }))

  if (data.ranges.some((range) => registered.some((other) => overlaps(range, other)))) {
    return {
      ok: false,
      error: 'El colaborador ya tiene una ausencia registrada que se traslapa con esas fechas.',
    }
  }

  const { error } = await supabase.from('sgrh_ausencias').insert(
    data.ranges.map((range) => {
      const { naturales, habiles } = countDays(range.fechaInicio, range.fechaFin)
      return {
        aus_historial_laboral_id: data.employmentHistoryId,
        aus_tipo_ausencia_id: data.tipoAusenciaId,
        aus_fecha_inicio: range.fechaInicio,
        aus_fecha_fin: range.fechaFin,
        aus_dias_naturales: naturales,
        aus_dias_habiles: habiles,
        aus_estado: 'aprobada',
        aus_numero_boleta_ccss: data.numeroBoletaCcss || null,
        aus_observaciones: data.observaciones || null,
      }
    })
  )

  if (error) {
    return { ok: false, error: 'No se pudo registrar la ausencia.' }
  }

  // Si el tipo afecta el pago (no es un permiso intradia como lactancia, que
  // no reemplaza el día), se reparte automáticamente en los periodos de
  // nómina que se traslapan con cada rango — así nómina se entera sin que
  // alguien tenga que repetir el registro desde "Registrar incapacidad". Es
  // mejor esfuerzo: si falla, la ausencia ya quedó guardada igual, solo no
  // se reflejó en la planilla (se puede revisar/registrar a mano después).
  const { data: tipo } = await supabase
    .from('sgrh_cat_tipos_ausencia')
    .select('tau_paga_empleador_dias, tau_es_intradia')
    .eq('tau_id', data.tipoAusenciaId)
    .maybeSingle<TipoAusenciaPagoRow>()

  if (tipo && !tipo.tau_es_intradia) {
    // Secuencial (no Promise.all): cada llamada lee cuánto tope mensual ya
    // se usó a partir de lo que la anterior acaba de guardar.
    for (const range of data.ranges) {
      await sincronizarAusenciaEnNomina(supabase, {
        historialLaboralId: data.employmentHistoryId,
        fechaInicio: range.fechaInicio,
        fechaFin: range.fechaFin,
        topeMensualEmpleador: tipo.tau_paga_empleador_dias,
      })
    }
    revalidatePath('/payroll')
  }

  revalidatePath('/schedule')
  return { ok: true }
}
