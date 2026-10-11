/**
 * Cálculo puro del banco de horas extra.
 *
 * Regla: las horas por encima de la jornada programada no se pagan solas en la
 * planilla de esa quincena — quedan "pendientes" en el banco de horas hasta que
 * el encargado de nómina decida pagarlas (monto sugerido: horas × salario por
 * hora × 1.5, editable) o compensarlas (sin pago, solo queda anotado).
 *
 * Cuáles son esas horas ya no se decide acá. Antes se restaba un tope
 * quincenal plano (horas − 88), que no distingue a quien tiene pactada una
 * jornada de 12 h de quien tiene 8: al primero le inventaba horas extra por
 * cumplir su horario. Ahora llegan calculadas día por día contra la
 * programación real (lib/horasPeriodo.ts).
 */

import { round2 } from '@/modules/payroll/lib/numeros'

/**
 * Factor de último recurso: tiempo y medio.
 *
 * El bueno sale del catálogo — el concepto HORAS_EXTRA ya guarda su
 * con_porcentaje (150 = 1,5×) y es lo que el encargado edita desde Nómina →
 * Conceptos. Este valor solo se usa si esa fila no se pudo leer o no tiene
 * porcentaje, para no dejar el pago sin sugerencia.
 */
export const FACTOR_HORAS_EXTRA = 1.5

/**
 * Factor a partir del porcentaje del catálogo: 150 → 1,5.
 *
 * Antes el 1,5 estaba quemado acá y el porcentaje del concepto no se miraba,
 * así que cambiarlo en la pantalla de Conceptos no tenía ningún efecto sobre
 * el banco de horas.
 */
export function factorHorasExtra(porcentajeCatalogo: number | null | undefined): number {
  if (typeof porcentajeCatalogo !== 'number' || !Number.isFinite(porcentajeCatalogo)) {
    return FACTOR_HORAS_EXTRA
  }
  if (porcentajeCatalogo <= 0) return FACTOR_HORAS_EXTRA
  return porcentajeCatalogo / 100
}

/** Monto sugerido para pagar `horas` de banco: horas × salario por hora × factor. */
export function calcularMontoSugeridoBancoHoras(
  horas: number,
  salarioPorHora: number,
  factor: number = FACTOR_HORAS_EXTRA
): number {
  return round2(horas * salarioPorHora * factor)
}
