/**
 * Cálculo puro del banco de horas extra.
 *
 * Regla: las horas trabajadas por encima de TOPE_HORAS_NORMALES_QUINCENAL en
 * una quincena ya no se pagan solas en esa misma planilla — quedan
 * "pendientes" en el banco de horas hasta que el encargado de nómina decida
 * pagarlas (monto sugerido: horas × salario por hora × 1.5, editable) o
 * compensarlas (sin pago, solo queda anotado).
 */

import { TOPE_HORAS_NORMALES_QUINCENAL } from './planilla'
import { round2 } from '@/modules/payroll/lib/numeros'

/** Cada hora extra se paga a tiempo y medio (1.5×) — mismo factor que ya usaba el concepto HORAS_EXTRA. */
export const FACTOR_HORAS_EXTRA = 1.5

/** Horas por encima del tope normal de la quincena (0 si no hay). */
export function calcularHorasExtraPendientes(horasTrabajadas: number): number {
  return Math.max(0, round2(horasTrabajadas - TOPE_HORAS_NORMALES_QUINCENAL))
}

/** Monto sugerido para pagar `horas` de banco al salario por hora dado (horas × salario × 1.5). */
export function calcularMontoSugeridoBancoHoras(horas: number, salarioPorHora: number): number {
  return round2(horas * salarioPorHora * FACTOR_HORAS_EXTRA)
}
