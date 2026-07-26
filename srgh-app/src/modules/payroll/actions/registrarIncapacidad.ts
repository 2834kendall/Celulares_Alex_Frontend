'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  diasSuperpuestos,
  parseFechaLocal,
  repartirDiasIncapacidad,
} from '@/modules/payroll/lib/incapacidad'
import { periodoLabel } from '@/modules/payroll/lib/format'
import {
  registrarIncapacidadSchema,
  type PeriodoAfectadoIncapacidad,
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

interface DetalleConPeriodoRow {
  ndt_id: number
  ndt_dias_incapacidad_empleador: number
  ndt_dias_incapacidad_ccss: number
  sgrh_nomina_periodo: {
    npe_id: number
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
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

  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
      ndt_dias_incapacidad_empleador,
      ndt_dias_incapacidad_ccss,
      sgrh_nomina_periodo (
        npe_id, npe_periodo_mes, npe_periodo_anio, npe_quincena,
        npe_fecha_inicio_periodo, npe_fecha_fin_periodo
      )
    `
    )
    .eq('ndt_historial_laboral_id', data.historialLaboralId)
    .returns<DetalleConPeriodoRow[]>()

  if (errDetalles) {
    // La incapacidad ya quedó guardada (para el historial); solo no se pudo
    // repartir en la planilla. Se avisa para que se revise a mano.
    return {
      ok: false,
      error:
        'La incapacidad se guardó, pero no se pudieron actualizar los periodos de nómina. Revisalo manualmente.',
    }
  }

  const fechaInicioInc = parseFechaLocal(data.fechaInicio)
  const fechaFinInc = parseFechaLocal(data.fechaFin)
  const totalDiasIncapacidad = diasSuperpuestos(
    fechaInicioInc,
    fechaFinInc,
    fechaInicioInc,
    fechaFinInc
  )

  const filas = (detalles ?? []).filter(
    (d): d is DetalleConPeriodoRow & { sgrh_nomina_periodo: NonNullable<DetalleConPeriodoRow['sgrh_nomina_periodo']> } =>
      d.sgrh_nomina_periodo !== null
  )

  // Días de esta incapacidad que caen dentro de cada periodo existente.
  const diasNuevosPorNdt = new Map<number, number>()
  for (const fila of filas) {
    const p = fila.sgrh_nomina_periodo
    if (!p.npe_fecha_inicio_periodo || !p.npe_fecha_fin_periodo) continue
    const dias = diasSuperpuestos(
      parseFechaLocal(p.npe_fecha_inicio_periodo),
      parseFechaLocal(p.npe_fecha_fin_periodo),
      fechaInicioInc,
      fechaFinInc
    )
    if (dias > 0) diasNuevosPorNdt.set(fila.ndt_id, dias)
  }

  const mesesTocados = new Set(
    filas
      .filter((f) => diasNuevosPorNdt.has(f.ndt_id))
      .map((f) => `${f.sgrh_nomina_periodo.npe_periodo_anio}-${f.sgrh_nomina_periodo.npe_periodo_mes}`)
  )

  const actualizaciones: { ndt_id: number; empleador: number; ccss: number }[] = []
  const periodosActualizados: PeriodoAfectadoIncapacidad[] = []

  for (const claveMes of mesesTocados) {
    const [anioStr, mesStr] = claveMes.split('-')
    const anio = Number(anioStr)
    const mes = Number(mesStr)

    const filasDelMes = filas
      .filter(
        (f) => f.sgrh_nomina_periodo.npe_periodo_anio === anio && f.sgrh_nomina_periodo.npe_periodo_mes === mes
      )
      .sort((a, b) => a.sgrh_nomina_periodo.npe_quincena - b.sgrh_nomina_periodo.npe_quincena)

    let usadoEsteMes = 0
    for (const fila of filasDelMes) {
      const diasNuevos = diasNuevosPorNdt.get(fila.ndt_id) ?? 0

      if (diasNuevos === 0) {
        // No tocado por esta incapacidad: su valor ya guardado cuenta para
        // el tope del mes, pero no se actualiza.
        usadoEsteMes += fila.ndt_dias_incapacidad_empleador
        continue
      }

      const totalPrevioEnPeriodo =
        fila.ndt_dias_incapacidad_empleador + fila.ndt_dias_incapacidad_ccss
      const nuevoTotalEnPeriodo = totalPrevioEnPeriodo + diasNuevos

      const reparto = repartirDiasIncapacidad(
        nuevoTotalEnPeriodo,
        usadoEsteMes,
        tipoAusencia.tau_paga_empleador_dias
      )
      usadoEsteMes += reparto.diasEmpleador

      actualizaciones.push({
        ndt_id: fila.ndt_id,
        empleador: reparto.diasEmpleador,
        ccss: reparto.diasCcss,
      })
      periodosActualizados.push({
        periodoId: fila.sgrh_nomina_periodo.npe_id,
        periodoLabel: periodoLabel(
          fila.sgrh_nomina_periodo.npe_periodo_mes,
          fila.sgrh_nomina_periodo.npe_periodo_anio,
          fila.sgrh_nomina_periodo.npe_quincena
        ),
        diasEmpleador: reparto.diasEmpleador,
        diasCcss: reparto.diasCcss,
      })
    }
  }

  const resultados = await Promise.all(
    actualizaciones.map(({ ndt_id, empleador, ccss }) =>
      supabase
        .from('sgrh_nomina_detalle')
        .update({ ndt_dias_incapacidad_empleador: empleador, ndt_dias_incapacidad_ccss: ccss })
        .eq('ndt_id', ndt_id)
    )
  )
  const errActualizacion = resultados.find((r) => r.error)
  if (errActualizacion) {
    return {
      ok: false,
      error:
        'La incapacidad se guardó, pero no se pudieron actualizar todos los periodos de nómina. Revisalo manualmente.',
    }
  }

  const diasCubiertos = [...diasNuevosPorNdt.values()].reduce((acc, d) => acc + d, 0)
  const diasSinPeriodo = Math.max(0, totalDiasIncapacidad - diasCubiertos)

  revalidatePath('/payroll')
  for (const p of periodosActualizados) {
    revalidatePath(`/payroll/${p.periodoId}`)
  }

  return { ok: true, periodosActualizados, diasSinPeriodo }
}
