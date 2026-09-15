'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  QUINCENAS_PROMEDIO_LIQUIDACION,
  anioCicloAguinaldo,
  calcularAntiguedad,
  calcularLiquidacion,
  calcularSalarioDiario,
  diasSalarioPendiente,
} from '@/modules/payroll/lib/liquidacion'
import { esConceptoDelTrabajador } from '@/modules/payroll/lib/planilla'
import { parseFechaLocal } from '@/modules/payroll/lib/fechas'
import { periodoLabel } from '@/modules/payroll/lib/format'
import {
  procesarLiquidacionSchema,
  type LiquidacionCalculada,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'

export type ProcesarLiquidacionResult =
  { ok: true; data: LiquidacionCalculada } | { ok: false; error: string }

interface HistorialRow {
  lab_id: number
  lab_fecha_inicio: string
  lab_fecha_fin: string | null
  lab_salario_base: number | null
  lab_salario_real: number | null
}

interface MotivoRow {
  mot_id: number
  mot_genera_cesantia: boolean
  mot_genera_preaviso: boolean
}

interface DetalleHistoricoRow {
  ndt_salario_bruto: number
  ndt_pagado: boolean
  sgrh_nomina_periodo: {
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
  } | null
}

interface ConceptoDeduccionRow {
  con_tipo: string
  con_tipo_calculo: string
  con_porcentaje: number | null
}

/**
 * Clave comparable a nivel de quincena (no solo mes) para poder ordenar y
 * filtrar periodos correctamente cuando hay dos quincenas en el mismo mes.
 */
function claveQuincenal(anio: number, mes: number, quincena: number): number {
  return (anio * 12 + mes) * 2 + (quincena - 1)
}

function claveDe(p: DetalleHistoricoRow): number {
  const periodo = p.sgrh_nomina_periodo!
  return claveQuincenal(periodo.npe_periodo_anio, periodo.npe_periodo_mes, periodo.npe_quincena)
}

function etiquetaDe(p: DetalleHistoricoRow): string {
  const periodo = p.sgrh_nomina_periodo!
  return periodoLabel(periodo.npe_periodo_mes, periodo.npe_periodo_anio, periodo.npe_quincena)
}

/**
 * Calcula la liquidación de un empleado y la deja guardada en
 * sgrh_liquidaciones (registro auditable, no se puede procesar dos veces
 * para el mismo contrato). También cierra el expediente laboral
 * (lab_fecha_fin, lab_motivo_salida_id).
 *
 * De dónde sale cada número:
 *
 *  - Salario diario: promedio de las quincenas PAGADAS de los últimos seis
 *    meses (12 quincenas contando la de salida), entre 30. Art. 30 CT. Con
 *    menos de dos quincenas pagadas se usa el salario del contrato y se
 *    avisa.
 *  - Salario pendiente: solo los días del mes de salida que no se pagaron
 *    por planilla. Si la primera quincena ya se pagó, se deben los días
 *    16 en adelante, no el mes entero.
 *  - Aguinaldo proporcional: lo pagado por planilla desde el 1° de diciembre
 *    anterior, más el salario pendiente de este finiquito, entre 12. Se
 *    recalcula desde los pagos reales y no desde la provisión acumulada,
 *    para que sea correcto aunque la provisión tenga huecos.
 *  - Deducciones: cuota obrera del catálogo (CCSS) sobre salario pendiente y
 *    vacaciones. Preaviso, cesantía y aguinaldo no cotizan.
 *
 * Solo cuentan las planillas ya pagadas. Una en borrador dentro de la
 * ventana no es un monto real todavía, pero tampoco se ignora en silencio:
 * se devuelve como advertencia para que se pague antes de cerrar el finiquito
 * o se sepa que quedó fuera.
 */
export async function procesarLiquidacion(
  input: ProcesarLiquidacionInput
): Promise<ProcesarLiquidacionResult> {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const parsed = procesarLiquidacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const data = parsed.data

  const supabase = await createClient()

  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id, lab_fecha_inicio, lab_fecha_fin, lab_salario_base, lab_salario_real')
    .eq('lab_id', data.historialLaboralId)
    .maybeSingle<HistorialRow>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudo cargar el historial laboral del empleado.' }
  }
  if (!historial) {
    return { ok: false, error: 'El empleado no existe o no es visible.' }
  }
  if (historial.lab_fecha_fin) {
    return { ok: false, error: 'Este empleado ya tiene una salida registrada.' }
  }

  const fechaSalida = parseFechaLocal(data.fechaSalida)
  const fechaIngreso = parseFechaLocal(historial.lab_fecha_inicio)
  if (fechaSalida.getTime() < fechaIngreso.getTime()) {
    return {
      ok: false,
      error: `La fecha de salida es anterior a la de ingreso (${historial.lab_fecha_inicio}).`,
    }
  }

  const { data: motivo, error: errMotivo } = await supabase
    .from('sgrh_cat_motivos_salida')
    .select('mot_id, mot_genera_cesantia, mot_genera_preaviso')
    .eq('mot_id', data.motivoSalidaId)
    .maybeSingle<MotivoRow>()

  if (errMotivo) {
    return { ok: false, error: 'No se pudo cargar el motivo de salida.' }
  }
  if (!motivo) {
    return { ok: false, error: 'El motivo de salida no existe.' }
  }

  const { data: historico, error: errHistorico } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      'ndt_salario_bruto, ndt_pagado, sgrh_nomina_periodo ( npe_periodo_mes, npe_periodo_anio, npe_quincena )'
    )
    .eq('ndt_historial_laboral_id', data.historialLaboralId)
    .returns<DetalleHistoricoRow[]>()

  if (errHistorico) {
    return { ok: false, error: 'No se pudo cargar el historial de pagos del empleado.' }
  }

  // La cuota obrera sale del catálogo, igual que en la planilla: no se quema
  // el 10,83 % acá. Si el catálogo no tiene ninguna deducción porcentual, la
  // liquidación sale sin deducciones y eso es decisión del catálogo.
  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_tipo, con_tipo_calculo, con_porcentaje')
    .eq('con_activo', true)
    .eq('con_tipo_calculo', 'porcentaje_deduccion_bruto')
    .returns<ConceptoDeduccionRow[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  const porcentajeDeduccionObrera = (conceptos ?? [])
    .filter(esConceptoDelTrabajador)
    .reduce((acc, c) => acc + (c.con_porcentaje ?? 0), 0)

  const anioSalida = fechaSalida.getFullYear()
  const mesSalida = fechaSalida.getMonth() + 1
  const diaSalida = fechaSalida.getDate()
  // Las quincenas del sistema se parten por día 15 del mes.
  const quincenaSalida = diaSalida <= 15 ? 1 : 2
  const claveSalida = claveQuincenal(anioSalida, mesSalida, quincenaSalida)

  const cicloAnio = anioCicloAguinaldo(mesSalida, anioSalida)
  // Diciembre del año anterior al cierre del ciclo, desde la 1ra quincena.
  const claveInicioCiclo = claveQuincenal(cicloAnio - 1, 12, 1)
  // Seis meses hacia atrás contando la quincena de salida.
  const claveInicioPromedio = claveSalida - (QUINCENAS_PROMEDIO_LIQUIDACION - 1)

  const conPeriodo = (historico ?? []).filter((p) => p.sgrh_nomina_periodo !== null)
  const hastaSalida = conPeriodo.filter((p) => claveDe(p) <= claveSalida)
  const pagados = hastaSalida.filter((p) => p.ndt_pagado)
  const sinPagar = hastaSalida.filter((p) => !p.ndt_pagado)

  const advertencias: string[] = []

  const sumaSalariosBrutosCicloAguinaldo = pagados
    .filter((p) => claveDe(p) >= claveInicioCiclo)
    .reduce((acc, p) => acc + p.ndt_salario_bruto, 0)

  const brutosVentanaPromedio = pagados
    .filter((p) => claveDe(p) >= claveInicioPromedio)
    .map((p) => p.ndt_salario_bruto)

  // Para el salario del contrato: lo que la planilla paga es lab_salario_base;
  // lab_salario_real solo cuando el base no está.
  const salarioContrato =
    (historial.lab_salario_base ?? 0) > 0
      ? historial.lab_salario_base!
      : (historial.lab_salario_real ?? 0)

  const { salarioDiario, origen: origenSalario } = calcularSalarioDiario(
    brutosVentanaPromedio,
    salarioContrato
  )
  if (origenSalario === 'contrato') {
    advertencias.push(
      `No hay suficientes quincenas pagadas en los últimos seis meses para promediar: el salario diario salió del salario del contrato (₡${salarioContrato.toLocaleString('es-CR')} ÷ 30).`
    )
  }
  if (salarioDiario <= 0) {
    return {
      ok: false,
      error:
        'No hay salario con qué calcular: el empleado no tiene quincenas pagadas y su contrato no tiene salario base.',
    }
  }

  const clavePrimeraQuincenaMes = claveQuincenal(anioSalida, mesSalida, 1)
  const primeraQuincenaPagada = pagados.some((p) => claveDe(p) === clavePrimeraQuincenaMes)
  const quincenaDeSalidaPagada = pagados.some((p) => claveDe(p) === claveSalida)

  const diasTrabajadosMesActual = diasSalarioPendiente({
    diaSalida,
    primeraQuincenaPagada,
    quincenaDeSalidaPagada,
  })
  if (quincenaDeSalidaPagada) {
    advertencias.push(
      'La quincena de salida ya está marcada como pagada por planilla, así que el finiquito no incluye salario pendiente.'
    )
  }

  // Lo que está en borrador no entra en ningún promedio ni en el aguinaldo,
  // y nadie tiene por qué adivinarlo mirando el resultado.
  if (sinPagar.length > 0) {
    const etiquetas = sinPagar
      .sort((a, b) => claveDe(a) - claveDe(b))
      .map(etiquetaDe)
      .slice(0, 4)
    const resto = sinPagar.length > 4 ? ` y ${sinPagar.length - 4} más` : ''
    advertencias.push(
      `Hay ${sinPagar.length} quincena(s) sin marcar como pagadas (${etiquetas.join(', ')}${resto}). No entraron en el promedio ni en el aguinaldo: pagalas por planilla antes de cerrar el finiquito, o quedarán fuera.`
    )
  }

  const antiguedad = calcularAntiguedad(fechaIngreso, fechaSalida)

  const resultado = calcularLiquidacion({
    salarioDiario,
    diasTrabajadosMesActual,
    sumaSalariosBrutosCicloAguinaldo,
    diasVacacionesPendientes: data.diasVacacionesPendientes,
    mesesAntiguedad: antiguedad.meses,
    diasSobrantesAntiguedad: antiguedad.diasSobrantes,
    generaCesantia: motivo.mot_genera_cesantia,
    generaPreaviso: motivo.mot_genera_preaviso,
    porcentajeDeduccionObrera,
  })

  const { data: inserted, error: errInsert } = await supabase
    .from('sgrh_liquidaciones')
    .insert({
      liq_historial_laboral_id: data.historialLaboralId,
      liq_motivo_salida_id: data.motivoSalidaId,
      liq_fecha_salida: data.fechaSalida,
      liq_salario_diario: salarioDiario,
      liq_dias_trabajados_mes: diasTrabajadosMesActual,
      liq_salario_proporcional: resultado.salarioProporcional,
      liq_aguinaldo_proporcional: resultado.aguinaldoProporcional,
      liq_dias_vacaciones_pendientes: data.diasVacacionesPendientes,
      liq_vacaciones_pagadas: resultado.vacacionesPagadas,
      liq_dias_preaviso: resultado.diasPreaviso,
      liq_preaviso: resultado.preaviso,
      liq_dias_cesantia: resultado.diasCesantia,
      liq_cesantia: resultado.cesantia,
      liq_total: resultado.total,
      liq_deducciones_obreras: resultado.deduccionesObreras,
      liq_neto: resultado.neto,
      liq_observaciones: advertencias.length > 0 ? advertencias.join('\n') : null,
    })
    .select('liq_id')
    .single<{ liq_id: number }>()

  if (errInsert) {
    // 23505 = violación de UNIQUE: liq_historial_laboral_id ya tiene una
    // liquidación guardada. Cualquier otro código es un problema distinto
    // (tabla, permisos, motivo inválido, etc.) — no asumimos que ya se
    // procesó si no es exactamente ese caso.
    if (errInsert.code === '23505') {
      return {
        ok: false,
        error: 'Ya existe una liquidación guardada para este empleado.',
      }
    }
    // No se expone errInsert.message al cliente: puede filtrar nombres de
    // tabla/constraint. Queda en el log del servidor para diagnóstico.
    console.error('procesarLiquidacion: error al insertar liquidación', errInsert)
    return {
      ok: false,
      error: 'No se pudo guardar la liquidación. Intentá de nuevo o avisá a soporte.',
    }
  }

  const { error: errCierre } = await supabase
    .from('sgrh_historial_laboral')
    .update({
      lab_fecha_fin: data.fechaSalida,
      lab_motivo_salida_id: data.motivoSalidaId,
    })
    .eq('lab_id', data.historialLaboralId)

  if (errCierre) {
    return {
      ok: false,
      error:
        'La liquidación se calculó y se guardó, pero no se pudo cerrar el expediente del empleado. Revisalo manualmente en Historial Laboral.',
    }
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')

  return {
    ok: true,
    data: {
      liqId: inserted.liq_id,
      salarioDiario,
      diasSalarioPendiente: diasTrabajadosMesActual,
      salarioProporcional: resultado.salarioProporcional,
      aguinaldoProporcional: resultado.aguinaldoProporcional,
      vacacionesPagadas: resultado.vacacionesPagadas,
      diasPreaviso: resultado.diasPreaviso,
      preaviso: resultado.preaviso,
      diasCesantia: resultado.diasCesantia,
      cesantia: resultado.cesantia,
      total: resultado.total,
      deduccionesObreras: resultado.deduccionesObreras,
      neto: resultado.neto,
      advertencias,
    },
  }
}
