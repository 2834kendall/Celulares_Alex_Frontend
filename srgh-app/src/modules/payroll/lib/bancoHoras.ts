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

/** Cada hora extra se paga a tiempo y medio (1.5×) — mismo factor que ya usaba el concepto HORAS_EXTRA. */
export const FACTOR_HORAS_EXTRA = 1.5

/** Monto sugerido para pagar `horas` de banco al salario por hora dado (horas × salario × 1.5). */
export function calcularMontoSugeridoBancoHoras(horas: number, salarioPorHora: number): number {
  return round2(horas * salarioPorHora * FACTOR_HORAS_EXTRA)
}
