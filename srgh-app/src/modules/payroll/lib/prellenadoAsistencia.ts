/**
 * Cómo se traduce la asistencia de una quincena en una fila de planilla.
 *
 * Es la regla que comparten "cargar empleados desde asistencia", "Recalcular
 * desde asistencia", la plantilla de Excel, la subida y la edición manual: si
 * cada camino tuviera su propia cuenta, armar la planilla por uno o por otro
 * daría montos distintos para la misma quincena.
 *
 * La regla (definida por el negocio):
 *
 *  - Cada contrato tiene un salario BASE (el del contrato, sobre el que se
 *    cotiza) y un salario REAL (lo que la persona gana de verdad).
 *  - Q1 son los días 1 al 15 (siempre 15). Q2 va del 16 al fin de mes: 13,
 *    14, 15 o 16 días según el mes.
 *  - El día del salario base vale base ÷ 30, tenga el mes los días que tenga.
 *  - El objetivo de cada quincena es fijo: salario real ÷ 2.
 *  - Quien cumple todas sus horas programadas cobra el objetivo completo. La
 *    diferencia entre la base de esa quincena y el objetivo se paga como
 *    AJUSTE, que calcula el sistema: nadie lo digita.
 *  - Quien trabaja menos cobra en proporción a su cumplimiento: base y ajuste
 *    se multiplican por el mismo ratio.
 *
 *    dias_quincena  = 15 en Q1; días_del_mes − 15 en Q2
 *    base_completa  = base ÷ 30 × dias_quincena
 *    objetivo       = real ÷ 2
 *    ratio          = min(horas cumplidas ÷ horas programadas, 1)
 *    pago_total     = objetivo × ratio
 *    base_pagada    = base_completa × ratio
 *    ajuste         = pago_total − base_pagada
 *
 * Ejemplo del negocio: base ₡400.000, real ₡430.000, Q2 de un mes de 31 días
 * (16 días), 96 de 128 h → base_completa 213.333,33; objetivo 215.000; ratio
 * 0,75; pago_total 161.250; base_pagada 160.000; ajuste 1.250.
 *
 * El ajuste sale por diferencia para que base + ajuste cuadre siempre con el
 * pago total al céntimo. Puede ser negativo: en una Q2 de 16 días la base de
 * esa quincena supera la mitad del salario cuando el real está muy cerca del
 * base, y el ajuste lo compensa para que el mes sume el salario real.
 *
 * "Horas cumplidas" son las trabajadas dentro del horario más las pagadas sin
 * trabajar (feriados, vacaciones, permisos con goce: con salario mensual esos
 * días están pagados, Arts. 147-152 CT). Las extra no suben el ratio: se
 * pagan aparte por el banco de horas.
 *
 * "Horas programadas" tiene que ser la jornada COMPLETA de la quincena, se
 * haya cargado el horario o no. Un día sin ninguna fila de programación
 * (lib/horasPeriodo.ts: DiaProgramado.sinProgramar) no es un día más corto:
 * es un dato que falta, y no contarlo abajo es el mismo bug que ya se pagó
 * una vez (una quincena entera por 9 horas de un solo día cargado). Por eso
 * esos días SÍ suman al denominador (ver cumplimientoQuincena) aunque no
 * hayan sumado nada arriba.
 */

import { lecturaUtilizable } from '@/modules/payroll/lib/horasPeriodo'
import {
  DIAS_MES_COMERCIAL,
  horasJornadaQuincena,
  horasPorDia,
  valorHoraOrdinaria,
} from '@/modules/payroll/lib/jornada'
import { round2 } from '@/modules/payroll/lib/numeros'

/** Lo que dicen las marcas de una quincena, reducido a lo que la planilla usa. */
export interface HorasDeAsistencia {
  horasEsperadas: number
  horasOrdinarias: number
  horasExtra: number
  /** Feriados y ausencias pagadas con horario (ver TotalesPeriodo). */
  horasAcreditadas: number
  /** Feriados y ausencias pagadas SIN horario, en fracción de día. */
  diasAcreditadosSinHorario: number
  /** Toda la quincena cubierta por feriados o ausencias. Ver lecturaUtilizable. */
  periodoCubiertoPorAusencias: boolean
  /** Horas del horario de toda la quincena, trabajadas o no. Denominador del ratio. */
  horasProgramadasTotales: number
  /** Feriados y ausencias de día completo sin horario (días enteros). */
  diasJustificadosSinHorario: number
  /**
   * Días sin ninguna fila de programación (ni horario, ni día libre, ni
   * feriado, ni ausencia): dato faltante. Cuentan en contra en el
   * cumplimiento (ver cumplimientoQuincena) para que un horario a medio
   * cargar no se pague como si esos días no existieran.
   */
  diasSinProgramar: number
}

/** Qué quincena es: define cuántos días de base le tocan. */
export interface QuincenaRef {
  anio: number
  /** 1 a 12. */
  mes: number
  /** 1 = días 1 al 15; 2 = del 16 al fin de mes. */
  quincena: number
}

/** Salarios y jornada del contrato. */
export interface ContratoPago {
  salarioBaseMensual: number
  /** lab_salario_real. Si falta o es 0 se toma el base: no hay ajuste que pagar. */
  salarioRealMensual: number | null
  /** tjo_horas_max_semanales; null cae a la jornada ordinaria diurna. */
  horasSemanales: number | null
}

export interface FilaPrellenada {
  horas: number
  horasExtra: number
  /** Valor de una hora ordinaria: salario real ÷ 30 ÷ horas del día. */
  salarioPorHora: number
  /** Monto del concepto BASE: base_completa × ratio. */
  base: number
  /** Monto del concepto AJUSTE: pago_total − base. Puede ser negativo. */
  ajuste: number
  /** base + ajuste: lo que cobra de salario en la quincena. */
  pagoTotal: number
  /** Cumplimiento de la quincena, de 0 a 1. */
  ratio: number
  /**
   * Horas que entraron al ratio sin haberse trabajado (feriados y ausencias
   * pagadas). Se devuelven para poder explicarlo.
   */
  horasPagadasSinTrabajar: number
  /**
   * false = no hay horas programadas contra las cuales medir (sin horario, o
   * sin permiso para ver la asistencia). Por regla el ratio es 0 y la fila
   * sale en ₡0; quien llama tiene que avisarlo.
   */
  desdeAsistencia: boolean
}

/** Días de salario base de la quincena: 15 en Q1; días del mes − 15 en Q2. */
export function diasDeLaQuincena({ anio, mes, quincena }: QuincenaRef): number {
  if (quincena !== 2) return 15
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return diasDelMes - 15
}

function salarioReal(contrato: ContratoPago): number {
  const real = contrato.salarioRealMensual
  return typeof real === 'number' && Number.isFinite(real) && real > 0
    ? real
    : contrato.salarioBaseMensual
}

/**
 * Cumplimiento de la quincena: horas cumplidas ÷ horas programadas, con tope 1.
 *
 * Un feriado o una ausencia sin horario programado no dice cuántas horas
 * valía: se le cuenta un día de la jornada (horas semanales ÷ 6) arriba Y
 * abajo, para que pese como un día normal. Una incapacidad CCSS suma abajo y
 * no arriba: el salario se suspende y se paga como subsidio por su lado.
 *
 * Un día SIN NINGUNA fila de programación (nadie lo cargó) suma abajo y NO
 * arriba: cuenta como jornada pendiente de cumplir, igual que un permiso sin
 * goce. Sin este ajuste, un horario a medio cargar —un solo día con horario
 * de 15— hacía que trabajar ESE día diera "cumplió el 100 % de lo
 * programado" y pagara la quincena entera por una jornada de trabajo. Se
 * avisa (problema 'sin_programar') pero no bloquea el pago: el negocio
 * decide así, igual que con 'sin_horario'.
 *
 * Sin horas programadas (ver lecturaUtilizable) el ratio es 0, por regla.
 */
export function cumplimientoQuincena(
  leidas: HorasDeAsistencia | null,
  horasSemanales: number | null
): { ratio: number; horasPagadasSinTrabajar: number } {
  if (!leidas || !lecturaUtilizable(leidas)) return { ratio: 0, horasPagadasSinTrabajar: 0 }

  const dia = horasPorDia(horasSemanales)
  const horasPagadasSinTrabajar = round2(
    leidas.horasAcreditadas + leidas.diasAcreditadosSinHorario * dia
  )
  const cumplidas = leidas.horasOrdinarias + horasPagadasSinTrabajar
  const programadas = round2(
    leidas.horasProgramadasTotales +
      leidas.diasJustificadosSinHorario * dia +
      leidas.diasSinProgramar * dia
  )

  if (!(programadas > 0)) return { ratio: 0, horasPagadasSinTrabajar }
  return { ratio: Math.min(cumplidas / programadas, 1), horasPagadasSinTrabajar }
}

/**
 * Fila prellenada de un empleado a partir de su asistencia (ver la regla
 * arriba). `totales` null o sin horas programadas = ratio 0.
 */
export function prellenarDesdeAsistencia(
  contrato: ContratoPago,
  totales: HorasDeAsistencia | null,
  quincena: QuincenaRef
): FilaPrellenada {
  const real = salarioReal(contrato)
  const salarioPorHora = valorHoraOrdinaria(real, contrato.horasSemanales)
  const leidas = totales !== null && lecturaUtilizable(totales) ? totales : null
  const { ratio, horasPagadasSinTrabajar } = cumplimientoQuincena(leidas, contrato.horasSemanales)

  // Sin redondear en el medio: 213.333,33 × 0,75 tiene que dar 160.000 exactos.
  const baseCompleta =
    (contrato.salarioBaseMensual / DIAS_MES_COMERCIAL) * diasDeLaQuincena(quincena)
  const objetivo = real / 2

  const pagoTotal = round2(objetivo * ratio)
  const base = round2(baseCompleta * ratio)
  const ajuste = round2(pagoTotal - base)

  return {
    horas: leidas ? leidas.horasOrdinarias : 0,
    horasExtra: leidas ? leidas.horasExtra : 0,
    salarioPorHora,
    base,
    ajuste,
    pagoTotal,
    ratio,
    horasPagadasSinTrabajar,
    desdeAsistencia: leidas !== null,
  }
}

/**
 * Montos de BASE que el SISTEMA pudo haber escrito para unas horas guardadas,
 * con cada regla que existió:
 *
 *  - la quincena entera (supuesto cuando la asistencia no servía);
 *  - las horas contra 96 h de jornada, sin acreditar feriados ni ausencias
 *    (la regla que rebajaba vacaciones);
 *  - las horas contra 96 h de jornada, acreditándolos;
 *  - las horas contra las horas esperadas del periodo (la regla original);
 *  - la regla de hoy (base ÷ 30 × días × ratio).
 *
 * Sirve para distinguir un BASE que puso el sistema —y que se puede rehacer—
 * de uno que corrigió una persona, que no se pisa.
 */
export function basesDelSistema(
  contrato: ContratoPago,
  guardadas: { horas: number; horasExtra: number },
  lectura: HorasDeAsistencia | null,
  quincena: QuincenaRef
): number[] {
  const mitad = contrato.salarioBaseMensual / 2
  const jornada = horasJornadaQuincena(contrato.horasSemanales)
  const bases = [round2(mitad), round2((mitad * Math.min(guardadas.horas, jornada)) / jornada)]

  if (lectura) {
    // La regla de 96 h acreditaba un día sin horario como jornada ÷ 2 ÷ 7.
    const pagadasSinTrabajar =
      lectura.horasAcreditadas + (lectura.diasAcreditadosSinHorario * jornada) / 2 / 7
    bases.push(round2((mitad * Math.min(guardadas.horas + pagadasSinTrabajar, jornada)) / jornada))
    if (lectura.horasEsperadas > 0) {
      bases.push(
        round2((mitad * Math.min(guardadas.horas, lectura.horasEsperadas)) / lectura.horasEsperadas)
      )
    }
    bases.push(
      prellenarDesdeAsistencia(
        contrato,
        { ...lectura, horasOrdinarias: guardadas.horas, horasExtra: guardadas.horasExtra },
        quincena
      ).base
    )
  }
  return bases
}

/** ¿Este monto es uno de los que pudo haber escrito el sistema? */
export function esBaseDelSistema(base: number, candidatos: readonly number[]): boolean {
  return candidatos.some((c) => Math.abs(base - c) < 0.5)
}

/**
 * ¿El salario guardado (BASE + AJUSTE) quedó viejo?
 *
 *  - BASE: solo se marca si lo puso el sistema con otra regla (ver
 *    basesDelSistema). Uno corregido a mano es una decisión y no se toca. La
 *    quincena entera no cuenta como "del sistema": es también el monto que
 *    más se pone a mano, y marcarla trabaría ese pago.
 *  - AJUSTE: lo calcula siempre el sistema, así que cualquier diferencia con
 *    la regla de hoy es vieja (un ajuste digitado a mano, o de antes de que
 *    fuera automático).
 */
export function evaluarBaseGuardado(params: {
  baseGuardado: number
  ajusteGuardado: number
  contrato: ContratoPago
  guardadas: { horas: number; horasExtra: number }
  lectura: HorasDeAsistencia | null
  quincena: QuincenaRef
}): { desactualizado: boolean; esperado: number | null; ajusteEsperado: number | null } {
  const { baseGuardado, ajusteGuardado, contrato, guardadas, lectura, quincena } = params
  if (!lecturaUtilizable(lectura) || !(contrato.salarioBaseMensual > 0)) {
    return { desactualizado: false, esperado: null, ajusteEsperado: null }
  }

  const fila = prellenarDesdeAsistencia(
    contrato,
    { ...lectura!, horasOrdinarias: guardadas.horas, horasExtra: guardadas.horasExtra },
    quincena
  )

  const quincenaEntera = round2(contrato.salarioBaseMensual / 2)
  const baseDistinto = Math.abs(baseGuardado - fila.base) >= 0.5
  const baseDelSistema = esBaseDelSistema(
    baseGuardado,
    basesDelSistema(contrato, guardadas, lectura, quincena).filter(
      (c) => Math.abs(c - quincenaEntera) >= 0.5
    )
  )
  const ajusteDistinto = Math.abs(ajusteGuardado - fila.ajuste) >= 0.5

  return {
    desactualizado: (baseDistinto && baseDelSistema) || ajusteDistinto,
    esperado: fila.base,
    ajusteEsperado: fila.ajuste,
  }
}

/**
 * BASE que corresponde cuando alguien cambia las horas a mano (Excel o
 * detalle) y deja el monto que había puesto el sistema.
 *
 * Si el BASE que llega es uno que el sistema pudo haber escrito —para las
 * horas de antes o para las nuevas— no es una decisión: se recalcula con las
 * horas nuevas. Si no, es un monto corregido a mano y se respeta. Sin esto, el
 * ajuste (que siempre se recalcula) seguía las horas nuevas y el BASE las
 * viejas, y la fila pagaba una mezcla de las dos.
 */
export function baseParaHorasEditadas(params: {
  baseIngresado: number
  contrato: ContratoPago
  lectura: HorasDeAsistencia | null
  horasPrevias: { horas: number; horasExtra: number } | null
  horasNuevas: { horas: number; horasExtra: number }
  quincena: QuincenaRef
}): { base: number; conservado: boolean } {
  const { baseIngresado, contrato, lectura, horasPrevias, horasNuevas, quincena } = params
  if (!lectura || !lecturaUtilizable(lectura)) return { base: baseIngresado, conservado: true }

  const nueva = prellenarDesdeAsistencia(
    contrato,
    { ...lectura, horasOrdinarias: horasNuevas.horas, horasExtra: horasNuevas.horasExtra },
    quincena
  ).base

  const candidatos = [
    ...basesDelSistema(contrato, horasNuevas, lectura, quincena),
    ...basesDelSistema(
      contrato,
      { horas: lectura.horasOrdinarias, horasExtra: lectura.horasExtra },
      lectura,
      quincena
    ),
    ...(horasPrevias ? basesDelSistema(contrato, horasPrevias, lectura, quincena) : []),
  ]
  if (baseIngresado <= 0 || esBaseDelSistema(baseIngresado, candidatos)) {
    return { base: nueva, conservado: false }
  }
  return { base: baseIngresado, conservado: true }
}
