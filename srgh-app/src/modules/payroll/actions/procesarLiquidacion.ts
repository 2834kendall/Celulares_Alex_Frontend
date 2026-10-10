'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  diaComercialDeSalida,
  MOTIVO_MUTUO_ACUERDO,
  TIPOS_CONTRATO_ART_31,
  calcularLiquidacion,
  diasCalendarioInclusive,
  diasSalarioPendiente,
  notaRubroSinDias,
} from '@/modules/payroll/lib/liquidacion'
import { esConceptoDelTrabajador } from '@/modules/payroll/lib/planilla'
import {
  ERROR_SIN_PERMISO_AUSENCIAS,
  puedeLeerAusencias,
  sucursalesVisibles,
} from '@/modules/payroll/lib/derechosData'
import { claveQuincenal } from '@/modules/payroll/lib/derechos'
import { sincronizarPeriodosDeLaSalida } from '@/modules/payroll/lib/estadoPeriodoData'
import {
  horasDeBancoPendientes,
  avisoAguinaldoAnterior,
  calcularBasesLiquidacion,
  cargarHistorialParaLiquidacion,
} from '@/modules/payroll/lib/liquidacionData'
import { formatCRC, formatHoras } from '@/modules/payroll/lib/format'
import {
  procesarLiquidacionSchema,
  type LiquidacionCalculada,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'

export type ProcesarLiquidacionResult =
  { ok: true; data: LiquidacionCalculada } | { ok: false; error: string }

interface MotivoRow {
  mot_id: number
  mot_codigo: string
  mot_nombre: string
  mot_genera_cesantia: boolean
  mot_genera_preaviso: boolean
}

interface ConceptoDeduccionRow {
  con_tipo: string
  con_tipo_calculo: string
  con_porcentaje: number | null
}

/**
 * Calcula la liquidación de un contrato ya terminado y la deja guardada en
 * sgrh_liquidaciones (registro auditable, no se puede procesar dos veces
 * para el mismo contrato). Terminar el contrato es un paso anterior, de RRHH,
 * desde el perfil del empleado (SGRH-90): de ahí salen la fecha de salida y
 * el motivo. Guardar la liquidación es definitivo: la RPC
 * registrar_liquidacion, en la misma transacción, borra los turnos
 * posteriores a la salida. El PAGO es otro paso (pagarLiquidacion), con su
 * propio comprobante.
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
  input: ProcesarLiquidacionInput,
  opciones: {
    /**
     * Solo calcula, sin guardar nada: la vista previa de la pantalla. Antes
     * "Calcular y guardar" guardaba de una vez, y el desglose y los avisos se
     * veían cuando ya no se podía corregir (una liquidación guardada no se
     * deshace).
     */
    soloCalcular?: boolean
    /**
     * Neto que se vio en la vista previa. Si al guardar el cálculo da otro
     * (alguien pagó una quincena o cambió una ausencia mientras tanto), no se
     * guarda: hay que volver a calcular y mirar.
     */
    netoEsperado?: number
  } = {}
): Promise<ProcesarLiquidacionResult> {
  // Liquidar ya no cierra el contrato (lo cierra RRHH al terminarlo), así que
  // alcanza con NOMINA_WRITE: no hace falta HISTORIAL_WRITE.
  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)

  // Sin permiso de ausencias, RLS devuelve vacío y la liquidación sale sin
  // incapacidades ni licencia de maternidad, mal y sin aviso. Se corta antes.
  if (!puedeLeerAusencias(claims)) {
    return { ok: false, error: ERROR_SIN_PERMISO_AUSENCIAS }
  }

  const parsed = procesarLiquidacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const data = parsed.data

  const supabase = await createClient()

  const historialResult = await cargarHistorialParaLiquidacion(supabase, data.historialLaboralId)
  if (!historialResult.ok) return historialResult
  const historial = historialResult.data
  // Último día trabajado, tal como lo registró RRHH al terminar el contrato.
  const fechaSalida = historial.lab_fecha_fin

  const { data: motivo, error: errMotivo } = await supabase
    .from('sgrh_cat_motivos_salida')
    .select('mot_id, mot_codigo, mot_nombre, mot_genera_cesantia, mot_genera_preaviso')
    .eq('mot_id', historial.lab_motivo_salida_id)
    .maybeSingle<MotivoRow>()

  if (errMotivo) {
    return { ok: false, error: 'No se pudo cargar el motivo de salida.' }
  }
  if (!motivo) {
    return { ok: false, error: 'El motivo de salida no existe.' }
  }

  // Mutuo acuerdo: la ley no obliga a pagar cesantía (Art. 86 CT), pero se
  // puede pactar. Lo dice quien liquida, siempre: no se supone ninguna de
  // las dos cosas.
  const esMutuoAcuerdo = motivo.mot_codigo === MOTIVO_MUTUO_ACUERDO
  if (esMutuoAcuerdo && !data.cesantiaPactada) {
    return {
      ok: false,
      error: 'En una salida por mutuo acuerdo indicá si se pactó pagar cesantía.',
    }
  }
  const generaCesantia = esMutuoAcuerdo ? data.cesantiaPactada === 'si' : motivo.mot_genera_cesantia

  const tipoContrato = historial.sgrh_cat_tipos_contrato?.tco_codigo ?? null
  const plazoFijoArt31 =
    tipoContrato !== null && TIPOS_CONTRATO_ART_31.has(tipoContrato) && motivo.mot_genera_preaviso
  if (plazoFijoArt31 && !data.plazoSeisMesesOMas) {
    return {
      ok: false,
      error:
        'Es un contrato a plazo fijo terminado por el patrono: indicá si se pactó por seis meses o más.',
    }
  }

  const basesResult = await calcularBasesLiquidacion(
    supabase,
    historial,
    fechaSalida,
    sucursalesVisibles(claims)
  )
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
        'No hay salario con qué calcular: el empleado no tiene quincenas pagadas y su contrato no tiene salario.',
    }
  }

  // Mes comercial: el último día del mes cuenta como 30 (ver diaComercialDeSalida).
  const diaSalida = diaComercialDeSalida(fechaSalida)
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

  // Las quincenas del mes de salida que siguen sin pagar son justamente las
  // que paga el salario pendiente (ver diasSalarioPendiente). Mandarlas a
  // pagar por planilla era pagar esos días dos veces; marcarDetallePagado ya
  // no lo permite.
  const clavePrimeraDelMes = claveQuincenal(
    Number(fechaSalida.slice(0, 4)),
    Number(fechaSalida.slice(5, 7)),
    1
  )
  // Mismas quincenas que paga diasSalarioPendiente (y que después frena
  // quincenaPagadaEnLiquidacion): la de salida y, si el pendiente arrancó el
  // día 1, también la primera del mes.
  const clavesEnLiquidacion = new Set<number>()
  if (diasTrabajadosMesActual > 0) {
    clavesEnLiquidacion.add(bases.claveSalida)
    if (diaSalida > 15 && diasTrabajadosMesActual > diaSalida - 15) {
      clavesEnLiquidacion.add(clavePrimeraDelMes)
    }
  }
  const enLaLiquidacion = bases.sinPagar.filter((q) => clavesEnLiquidacion.has(q.clave))
  const porPlanilla = bases.sinPagar.filter((q) => !enLaLiquidacion.includes(q))

  if (enLaLiquidacion.length > 0) {
    advertencias.push(
      `${enLaLiquidacion.map((q) => q.etiqueta).join(' y ')}: sin pagar por planilla; esos días van en esta liquidación como salario pendiente (${diasTrabajadosMesActual} día(s)). No se pagan también por planilla.`
    )
  }

  // Lo que está en borrador no entra en ningún promedio ni en el aguinaldo,
  // y nadie tiene por qué adivinarlo mirando el resultado.
  if (porPlanilla.length > 0) {
    const etiquetas = porPlanilla.map((q) => q.etiqueta).slice(0, 4)
    const resto = porPlanilla.length > 4 ? ` y ${porPlanilla.length - 4} más` : ''
    advertencias.push(
      `Hay ${porPlanilla.length} quincena(s) sin marcar como pagadas (${etiquetas.join(', ')}${resto}). No entraron en el promedio ni en el aguinaldo: pagalas por planilla antes de cerrar el finiquito, o quedarán fuera.`
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
  } else if (bases.inicioRelacion && bases.inicioRelacion > bases.ingresoOriginal) {
    advertencias.push(
      `La antigüedad se midió desde el reingreso (${bases.inicioRelacion}): la relación anterior ya se liquidó y ese tiempo no se vuelve a contar.`
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

  if (esMutuoAcuerdo) {
    advertencias.push(
      data.cesantiaPactada === 'si'
        ? 'Mutuo acuerdo: se pagó cesantía porque quien liquidó indicó que se pactó (la ley no la exige, Art. 86 CT).'
        : 'Mutuo acuerdo: no se pagó cesantía; quien liquidó indicó que no se pactó (Art. 86 CT: termina sin responsabilidad para las partes).'
    )
  }

  // Contrato a plazo fijo (u obra determinada) que el patrono termina sin
  // justa causa: no lleva preaviso ni cesantía (son del contrato por tiempo
  // indefinido) sino la indemnización del Art. 31 CT. Antes se liquidaba como
  // indefinido (auditoría 2, riesgo "plazo fijo"). "Sin justa causa" = un
  // motivo que genera preaviso (despido con responsabilidad, reducción de
  // personal, cierre…); si el plazo se cumplió, el motivo es "Fin de
  // contrato a plazo fijo", que no genera nada.
  const plazoFijo = plazoFijoArt31
    ? {
        diasTrabajados: diasCalendarioInclusive(historial.lab_fecha_inicio, fechaSalida),
        seisMesesOMas: data.plazoSeisMesesOMas === 'si',
      }
    : null
  if (plazoFijo) {
    advertencias.push(
      `${historial.sgrh_cat_tipos_contrato?.tco_codigo === 'OBRA_DET' ? 'Contrato por obra determinada' : 'Contrato a plazo fijo'} terminado por el patrono: en vez de preaviso y cesantía se paga la indemnización del Art. 31 del Código de Trabajo, un día de salario por cada siete días trabajados (${plazoFijo.diasTrabajados} días), con un mínimo de 3 días${plazoFijo.seisMesesOMas ? ' y, por haberse pactado por seis meses o más, de 22 días' : ''}. El trabajador puede reclamar además daños y perjuicios por el plazo que faltaba; eso lo fija un juez y no está en este cálculo.`
    )
  }

  const avisoAnterior = await avisoAguinaldoAnterior(supabase, bases.cicloAnterior)
  if (avisoAnterior) advertencias.push(avisoAnterior)

  // Horas extra que seguían pendientes en el banco de horas: después de la
  // salida no hay quincena donde pagarlas, así que van en el finiquito
  // (auditoría, hallazgo 4). La RPC las deja pagadas por esta liquidación.
  const banco = await horasDeBancoPendientes(supabase, bases.labIds, clavesEnLiquidacion)
  if (!banco.ok) {
    return {
      ok: false,
      error: 'No se pudieron leer las horas pendientes del banco de horas del empleado.',
    }
  }
  if (banco.data.movimientos.length > 0) {
    advertencias.push(
      `Se pagan ${formatHoras(banco.data.horas)} h extra que seguían pendientes en el banco de horas (${formatCRC(banco.data.monto)}). Esos movimientos quedan pagados por esta liquidación.`
    )
  }
  // Horas del banco que ya se habían pagado a una quincena que esta
  // liquidación cubre: esa fila no se paga por planilla, así que sin esto la
  // plata no salía por ningún lado (auditoría 2, fallo 4).
  const absorbidos = banco.data.absorbidos
  const horasAbsorbidas = absorbidos.reduce((t, m) => t + m.horas, 0)
  const montoAbsorbido = absorbidos.reduce((t, m) => Math.round((t + m.monto) * 100) / 100, 0)
  if (absorbidos.length > 0) {
    advertencias.push(
      `Se pagan también ${formatHoras(horasAbsorbidas)} h extra del banco de horas (${formatCRC(montoAbsorbido)}) que se habían sumado a ${[...new Set(absorbidos.map((m) => m.quincena))].join(' y ')}: esa quincena va en esta liquidación como salario pendiente y no se paga por planilla.`
    )
  }

  const resultado = calcularLiquidacion({
    horasExtraBanco: {
      horas: banco.data.horas + horasAbsorbidas,
      monto: Math.round((banco.data.monto + montoAbsorbido) * 100) / 100,
    },
    salarioDiario,
    salarioDiarioVacaciones: bases.promedioVacaciones.salarioDiario,
    diasTrabajadosMesActual,
    sumaSalariosBrutosCicloAguinaldo: bases.sumaCicloAguinaldo,
    aguinaldoAplica: bases.aguinaldoAplica,
    diasVacacionesPendientes: data.diasVacacionesPendientes,
    mesesAntiguedad: bases.antiguedad.meses,
    diasSobrantesAntiguedad: bases.antiguedad.diasSobrantes,
    generaCesantia,
    generaPreaviso: motivo.mot_genera_preaviso,
    porcentajeDeduccionObrera,
    plazoFijo,
  })

  const notaPreaviso = notaRubroSinDias({
    rubro: 'preaviso',
    dias: resultado.diasPreaviso,
    plazoFijo: plazoFijo !== null,
    generaPorMotivo: motivo.mot_genera_preaviso,
    motivoNombre: motivo.mot_nombre,
  })
  const notaCesantia = notaRubroSinDias({
    rubro: 'cesantia',
    dias: resultado.diasCesantia,
    plazoFijo: plazoFijo !== null,
    generaPorMotivo: generaCesantia || esMutuoAcuerdo,
    motivoNombre: motivo.mot_nombre,
    mutuoAcuerdoSinCesantia: esMutuoAcuerdo && data.cesantiaPactada !== 'si',
  })

  const desglose = {
    salarioDiario,
    salarioDiarioVacaciones: bases.promedioVacaciones.salarioDiario,
    diasSalarioPendiente: diasTrabajadosMesActual,
    salarioProporcional: resultado.salarioProporcional,
    aguinaldoProporcional: resultado.aguinaldoProporcional,
    diasVacaciones: data.diasVacacionesPendientes,
    vacacionesPagadas: resultado.vacacionesPagadas,
    horasExtraBanco: resultado.horasExtraBanco,
    diasPreaviso: resultado.diasPreaviso,
    preaviso: resultado.preaviso,
    diasCesantia: resultado.diasCesantia,
    cesantia: resultado.cesantia,
    notaPreaviso,
    notaCesantia,
    diasIndemnizacionPlazoFijo: resultado.diasIndemnizacionPlazoFijo,
    indemnizacionPlazoFijo: resultado.indemnizacionPlazoFijo,
    total: resultado.total,
    deduccionesObreras: resultado.deduccionesObreras,
    neto: resultado.neto,
    advertencias,
  }

  if (opciones.soloCalcular) {
    return { ok: true, data: { liqId: null, ...desglose } }
  }
  if (
    typeof opciones.netoEsperado === 'number' &&
    Math.abs(opciones.netoEsperado - resultado.neto) > 0.005
  ) {
    return {
      ok: false,
      error: `Los montos cambiaron desde la vista previa (el neto era ${formatCRC(opciones.netoEsperado)} y ahora da ${formatCRC(resultado.neto)}): no se guardó nada. Volvé a calcular y revisá el desglose.`,
    }
  }

  // Una sola transacción (RPC registrar_liquidacion): guarda la liquidación y
  // borra los turnos posteriores a la salida. El contrato, la fecha y el
  // motivo los toma la RPC de la fila del contrato, bloqueada: no viajan en
  // el payload y no pueden contradecir lo que registró RRHH. El bloqueo
  // también impide que se cruce con una reversión de la terminación.
  const { data: liqId, error: errLiquidacion } = await supabase.rpc('registrar_liquidacion', {
    p_lab_id: data.historialLaboralId,
    p_liquidacion: {
      liq_salario_diario: salarioDiario,
      liq_salario_diario_vacaciones: bases.promedioVacaciones.salarioDiario,
      liq_dias_trabajados_mes: diasTrabajadosMesActual,
      liq_salario_proporcional: resultado.salarioProporcional,
      liq_aguinaldo_proporcional: resultado.aguinaldoProporcional,
      liq_dias_vacaciones_pendientes: data.diasVacacionesPendientes,
      liq_dias_vacaciones_propuestos: propuestos,
      liq_vacaciones_pagadas: resultado.vacacionesPagadas,
      liq_horas_extra_banco: resultado.horasExtraBanco,
      liq_dias_preaviso: resultado.diasPreaviso,
      liq_preaviso: resultado.preaviso,
      liq_dias_cesantia: resultado.diasCesantia,
      liq_cesantia: resultado.cesantia,
      liq_nota_preaviso: notaPreaviso,
      liq_nota_cesantia: notaCesantia,
      liq_dias_indemnizacion_plazo_fijo: resultado.diasIndemnizacionPlazoFijo,
      liq_indemnizacion_plazo_fijo: resultado.indemnizacionPlazoFijo,
      liq_total: resultado.total,
      liq_deducciones_obreras: resultado.deduccionesObreras,
      liq_neto: resultado.neto,
      liq_observaciones: advertencias.length > 0 ? advertencias.join('\n') : null,
      // La RPC deja estos movimientos pagados por la liquidación, en la misma
      // transacción. Si alguno ya no está pendiente, no guarda nada.
      banco_horas: [
        ...banco.data.movimientos.map((m) => ({ bhm_id: m.bhmId, monto: m.monto })),
        ...absorbidos.map((m) => ({ bhm_id: m.bhmId, monto: m.monto, absorbido: true })),
      ],
      resuelto_por_id: (claims.app_metadata as { usr_id?: number })?.usr_id ?? null,
    },
  })

  if (errLiquidacion || typeof liqId !== 'number') {
    // 23505: ya hay una liquidación para este contrato (la RPC lo verifica,
    // y el UNIQUE de liq_historial_laboral_id lo garantiza si dos personas
    // guardan a la vez).
    if (errLiquidacion?.code === '23505') {
      return { ok: false, error: 'Ya existe una liquidación guardada para este contrato.' }
    }
    // 23514 / 23503 / 42501 vienen con un mensaje escrito para la UI (el
    // contrato se revirtió mientras tanto, dejó de existir, falta permiso).
    if (errLiquidacion && ['23514', '23503', '42501'].includes(errLiquidacion.code)) {
      return { ok: false, error: errLiquidacion.message }
    }
    // Cualquier otro puede filtrar nombres de tabla o constraint: queda en el
    // log del servidor, no en la pantalla.
    console.error('procesarLiquidacion: error al guardar la liquidación', errLiquidacion)
    return {
      ok: false,
      error: 'No se pudo guardar la liquidación. Intentá de nuevo o avisá a soporte.',
    }
  }

  // La fila impaga de la quincena de salida ya la paga esta liquidación: su
  // periodo puede cerrarse si todos los demás estaban pagados. Si el
  // salario pendiente es 0 no hay ninguna que cubrir.
  if (diasTrabajadosMesActual > 0) {
    try {
      await sincronizarPeriodosDeLaSalida(supabase, bases.labIds, fechaSalida)
      revalidatePath('/payroll')
    } catch (err) {
      console.error('procesarLiquidacion: no se pudo recalcular el periodo de la salida', err)
    }
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')
  // El perfil deja de mostrar el contrato como "pendiente de liquidar".
  revalidatePath('/employees')
  revalidatePath(`/employees/${historial.lab_empleado_id}`)

  return { ok: true, data: { liqId, ...desglose } }
}
