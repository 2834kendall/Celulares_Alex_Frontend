/**
 * La jornada pactada del contrato, y el valor de la hora que sale de ella.
 *
 * Hasta ahora el valor de la hora se sacaba dividiendo el salario entre las
 * horas PROGRAMADAS de la quincena. Eso mezcla dos cosas distintas:
 *
 *  - Cuánto vale una hora de esta persona. Es una propiedad del CONTRATO: su
 *    salario y su jornada pactada. No cambia porque alguien todavía no haya
 *    armado el horario del periodo.
 *  - Cuánto le toca cobrar esta quincena. Eso sí depende de lo que trabajó.
 *
 * Al usar el mismo número para las dos, una quincena con un solo día
 * programado daba un valor hora de ₡26.111 en vez de ₡2.447: el salario
 * entero repartido entre 9 horas. Y como la hora extra se paga sobre ese
 * valor, el banco de horas sugería pagar diez veces lo que correspondía.
 *
 * El dato correcto ya existía en la base y nadie lo leía: el contrato apunta a
 * un tipo de jornada (sgrh_cat_tipos_jornada) que dice cuántas horas
 * semanales son. DIURNA son 48, PARCIAL_DIURNA 30, ACUMULATIVA 70.
 */

import { round2 } from '@/modules/payroll/lib/numeros'

/**
 * Semanas que se le cobran a una quincena.
 *
 * Una quincena es medio mes, y un mes son 4,333 semanas (52 ÷ 12), así que lo
 * exacto serían 2,1665. Se usa 2 a propósito: es como se pacta y se habla de
 * la jornada en la práctica —"48 horas por semana, 96 por quincena"— y es el
 * número con el que el encargado revisa la planilla. La diferencia se
 * reconoce en el aguinaldo y en las vacaciones, no acá.
 */
export const SEMANAS_POR_QUINCENA = 2

/** Jornada semanal que se supone cuando el contrato no la tiene definida. */
export const HORAS_SEMANALES_POR_DEFECTO = 48

/**
 * Horas de la jornada pactada en una quincena.
 *
 * `horasSemanales` viene de sgrh_cat_tipos_jornada.tjo_horas_max_semanales. Si
 * falta o no es un número usable, se cae a la jornada ordinaria diurna: es el
 * supuesto que menos daño hace, porque es la jornada que tiene casi todo el
 * mundo y deja el valor hora en el orden correcto.
 */
export function horasJornadaQuincena(horasSemanales: number | null | undefined): number {
  const semanales =
    typeof horasSemanales === 'number' && Number.isFinite(horasSemanales) && horasSemanales > 0
      ? horasSemanales
      : HORAS_SEMANALES_POR_DEFECTO

  return round2(semanales * SEMANAS_POR_QUINCENA)
}

/** Días de la semana laboral ordinaria (Art. 136 CT: jornada de 6 días). */
export const DIAS_LABORALES_POR_SEMANA = 6

/** Mes comercial: el salario diario es el mensual ÷ 30, tenga el mes los días que tenga. */
export const DIAS_MES_COMERCIAL = 30

/**
 * Horas de un día de la jornada pactada: horas semanales ÷ 6. DIURNA (48 h)
 * da 8. Sin jornada en el contrato, la ordinaria diurna.
 */
export function horasPorDia(horasSemanales: number | null | undefined): number {
  const semanales =
    typeof horasSemanales === 'number' && Number.isFinite(horasSemanales) && horasSemanales > 0
      ? horasSemanales
      : HORAS_SEMANALES_POR_DEFECTO
  return semanales / DIAS_LABORALES_POR_SEMANA
}

/**
 * Valor de una hora ordinaria: salario REAL mensual ÷ 30 ÷ horas del día
 * (₡430.000 en jornada de 48 h → 430.000 ÷ 30 ÷ 8 = ₡1.791,67).
 *
 * Sale del salario real y no del base porque es lo que la persona gana de
 * verdad, y en Costa Rica la hora extra se paga sobre el salario ordinario
 * efectivo (decisión del negocio). Es el número sobre el que se paga la hora
 * extra (× 1,5), así que un error acá se multiplica: por eso NO depende de lo
 * que la persona trabajó ni de lo que alguien alcanzó a programar.
 */
export function valorHoraOrdinaria(
  salarioMensual: number,
  horasSemanales: number | null | undefined
): number {
  if (!Number.isFinite(salarioMensual) || salarioMensual <= 0) return 0

  return round2(salarioMensual / DIAS_MES_COMERCIAL / horasPorDia(horasSemanales))
}
