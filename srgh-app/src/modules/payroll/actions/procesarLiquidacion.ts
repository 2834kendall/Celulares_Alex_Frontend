'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { calcularLiquidacion, diasSalarioPendiente } from '@/modules/payroll/lib/liquidacion'
import { esConceptoDelTrabajador } from '@/modules/payroll/lib/planilla'
import { ERROR_SIN_PERMISO_AUSENCIAS, puedeLeerAusencias } from '@/modules/payroll/lib/derechosData'
import {
  avisoAguinaldoAnterior,
  calcularBasesLiquidacion,
  cargarHistorialParaLiquidacion,
} from '@/modules/payroll/lib/liquidacionData'
import {
  procesarLiquidacionSchema,
  type LiquidacionCalculada,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'

export type ProcesarLiquidacionResult =
  { ok: true; data: LiquidacionCalculada } | { ok: false; error: string }

interface MotivoRow {
  mot_id: number
  mot_genera_cesantia: boolean
  mot_genera_preaviso: boolean
}

interface ConceptoDeduccionRow {
  con_tipo: string
  con_tipo_calculo: string
  con_porcentaje: number | null
}

/**
 * Calcula la liquidación de un empleado y la deja guardada en
 * sgrh_liquidaciones (registro auditable, no se puede procesar dos veces
 * para el mismo contrato). También cierra el expediente laboral
 * (lab_fecha_fin, lab_motivo_salida_id). El PAGO es otro paso
 * (pagarLiquidacion), con su propio comprobante.
 *
 * De dónde sale cada número (las reglas y sus fuentes están en
 * lib/derechos.ts y lib/liquidacion.ts):
 *
 *  - Salario diario (preaviso y cesantía): promedio de las últimas 12
 *    quincenas PAGADAS sin incapacidad, entre 30 (Art. 30 CT). Una quincena
 *    con incapacidad se salta y entra la anterior (MTSS DAJ-AE-142-11); una
 *    de licencia de maternidad cuenta con su salario completo.
 *  - Vacaciones: promedio de las últimas 23 quincenas (la "última
 *    cincuentena" del Art. 157 CT), con la misma regla, entre 30.
 *  - Días de vacaciones: los digita quien liquida; el sistema los propone
 *    (1 por mes laborado menos los tomados) y guarda la propuesta al lado.
 *  - Salario pendiente: solo los días del mes de salida que no se pagaron
 *    por planilla.
 *  - Aguinaldo proporcional: salario del ciclo (1 dic → salida) con la
 *    licencia de maternidad al 100 %, más el pendiente, entre 12. Cero si no
 *    llega al mes continuo que exige la ley.
 *  - Deducciones: cuota obrera del catálogo (CCSS) sobre salario pendiente y
 *    vacaciones. Preaviso, cesantía y aguinaldo no cotizan.
 *
 * Todo se lee de la RELACIÓN laboral (contratos de un traslado incluidos),
 * no solo del contrato vigente.
 */
export async function procesarLiquidacion(
  input: ProcesarLiquidacionInput
): Promise<ProcesarLiquidacionResult> {
  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)

  // Liquidar toca DOS tablas con permisos distintos: sgrh_liquidaciones pide
  // NOMINA_WRITE y cerrar el expediente pide HISTORIAL_WRITE. El rol CONTADOR
  // tiene el primero y no el segundo, y RLS no devuelve error cuando bloquea
  // un UPDATE: filtra la fila, el UPDATE toca 0 registros y PostgREST responde
  // "todo bien". Resultado: liquidación guardada, empleado todavía activo, y
  // como liq_historial_laboral_id es UNIQUE ya no se puede reintentar.
  //
  // Por eso se corta ANTES de escribir nada, no después.
  const permisos = ((claims.app_metadata ?? {}) as { permisos?: string[] }).permisos ?? []
  if (!permisos.includes(PERMISOS.HISTORIAL_WRITE)) {
    return {
      ok: false,
      error:
        'Para liquidar hace falta también permiso de escritura sobre Historial Laboral: la liquidación cierra el expediente del empleado. Pedile a un administrador que te agregue HISTORIAL_WRITE, o que un usuario con ese permiso procese la salida.',
    }
  }
  // Mismo razonamiento con las ausencias: sin permiso, RLS devuelve vacío y
  // la liquidación sale sin incapacidades ni licencia de maternidad, mal y
  // sin aviso.
  if (!puedeLeerAusencias(claims)) {
    return { ok: false, error: ERROR_SIN_PERMISO_AUSENCIAS }
  }

  const parsed = procesarLiquidacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const data = parsed.data

  const supabase = await createClient()

  const historialResult = await cargarHistorialParaLiquidacion(
    supabase,
    data.historialLaboralId,
    data.fechaSalida
  )
  if (!historialResult.ok) return historialResult
  const historial = historialResult.data

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

  const basesResult = await calcularBasesLiquidacion(supabase, historial, data.fechaSalida)
  if (!basesResult.ok) return basesResult
  const bases = basesResult.data

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

  const advertencias: string[] = []
  const { salarioDiario, origen: origenSalario } = bases.promedio

  if (origenSalario === 'contrato') {
    advertencias.push(
      `No hay suficientes quincenas pagadas para promediar: el salario diario salió del salario del contrato (₡${bases.salarioContrato.toLocaleString('es-CR')} ÷ 30).`
    )
  }
  if (bases.promedio.excluidas.length > 0) {
    advertencias.push(
      `No entraron en el promedio por tener incapacidad (un subsidio no es salario): ${bases.promedio.excluidas.join(', ')}. En su lugar se tomaron quincenas anteriores.`
    )
  }
  if (salarioDiario <= 0) {
    return {
      ok: false,
      error:
        'No hay salario con qué calcular: el empleado no tiene quincenas pagadas y su contrato no tiene salario base.',
    }
  }

  const diaSalida = Number(data.fechaSalida.slice(8, 10))
  const { primeraQuincenaPagada, quincenaDeSalidaPagada } = bases.diasSalarioPendienteBase
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
  if (bases.sinPagar.length > 0) {
    const etiquetas = bases.sinPagar.map((q) => q.etiqueta).slice(0, 4)
    const resto = bases.sinPagar.length > 4 ? ` y ${bases.sinPagar.length - 4} más` : ''
    advertencias.push(
      `Hay ${bases.sinPagar.length} quincena(s) sin marcar como pagadas (${etiquetas.join(', ')}${resto}). No entraron en el promedio ni en el aguinaldo: pagalas por planilla antes de cerrar el finiquito, o quedarán fuera.`
    )
  }

  if (!bases.aguinaldoAplica) {
    advertencias.push(
      'No se paga aguinaldo proporcional: no llega a un mes laborado en forma continua, que es el mínimo que exige la ley (MTSS).'
    )
  }

  if (bases.ausenciasSinTipo > 0) {
    advertencias.push(
      `${bases.ausenciasSinTipo} ausencia(s) aprobada(s) no tienen un tipo legible: no se pudo saber si son incapacidad o licencia de maternidad. Revisalas en Ausencias.`
    )
  }

  if (!bases.ingresoOriginal) {
    advertencias.push(
      'El empleado no tiene fecha de ingreso original registrada, así que la antigüedad se midió desde el inicio de este contrato. Si tuvo contratos anteriores, la cesantía y el preaviso quedan cortos: cargá la fecha en su ficha y volvé a calcular.'
    )
  } else if (bases.ingresoOriginal !== historial.lab_fecha_inicio) {
    advertencias.push(
      `La antigüedad se midió desde el ingreso a la empresa (${bases.ingresoOriginal}), no desde el inicio de este contrato (${historial.lab_fecha_inicio}).`
    )
  }

  const propuestos = bases.vacaciones.diasPendientes
  if (data.diasVacacionesPendientes !== propuestos) {
    advertencias.push(
      `Se liquidaron ${data.diasVacacionesPendientes} día(s) de vacaciones; el sistema proponía ${propuestos} (${bases.vacaciones.diasGanados} ganados − ${bases.vacaciones.diasTomados} tomados).`
    )
  }

  const avisoAnterior = await avisoAguinaldoAnterior(supabase, bases.cicloAnterior)
  if (avisoAnterior) advertencias.push(avisoAnterior)

  const resultado = calcularLiquidacion({
    salarioDiario,
    salarioDiarioVacaciones: bases.promedioVacaciones.salarioDiario,
    diasTrabajadosMesActual,
    sumaSalariosBrutosCicloAguinaldo: bases.sumaCicloAguinaldo,
    aguinaldoAplica: bases.aguinaldoAplica,
    diasVacacionesPendientes: data.diasVacacionesPendientes,
    mesesAntiguedad: bases.antiguedad.meses,
    diasSobrantesAntiguedad: bases.antiguedad.diasSobrantes,
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
      liq_salario_diario_vacaciones: bases.promedioVacaciones.salarioDiario,
      liq_dias_trabajados_mes: diasTrabajadosMesActual,
      liq_salario_proporcional: resultado.salarioProporcional,
      liq_aguinaldo_proporcional: resultado.aguinaldoProporcional,
      liq_dias_vacaciones_pendientes: data.diasVacacionesPendientes,
      liq_dias_vacaciones_propuestos: propuestos,
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

  // Se pide la fila de vuelta para CONTAR lo que se escribió. Sin el select,
  // un UPDATE que RLS filtró devuelve error null y cero filas: indistinguible
  // de un cierre correcto. El pre-chequeo de arriba cubre el caso conocido;
  // esto cubre cualquier otro (empresa que no coincide, fila movida).
  const { data: cerrado, error: errCierre } = await supabase
    .from('sgrh_historial_laboral')
    .update({
      lab_fecha_fin: data.fechaSalida,
      lab_motivo_salida_id: data.motivoSalidaId,
    })
    .eq('lab_id', data.historialLaboralId)
    .select('lab_id')
    .returns<{ lab_id: number }[]>()

  if (errCierre || !cerrado || cerrado.length === 0) {
    return {
      ok: false,
      error: `La liquidación se guardó (n.° ${inserted.liq_id}) pero el expediente del empleado NO se cerró: sigue apareciendo como activo. Cerralo a mano en Historial Laboral poniéndole la fecha de salida ${data.fechaSalida} y el motivo, o pedile a alguien con permiso de Historial que lo haga.`,
    }
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')

  return {
    ok: true,
    data: {
      liqId: inserted.liq_id,
      salarioDiario,
      salarioDiarioVacaciones: bases.promedioVacaciones.salarioDiario,
      diasSalarioPendiente: diasTrabajadosMesActual,
      salarioProporcional: resultado.salarioProporcional,
      aguinaldoProporcional: resultado.aguinaldoProporcional,
      diasVacaciones: data.diasVacacionesPendientes,
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
