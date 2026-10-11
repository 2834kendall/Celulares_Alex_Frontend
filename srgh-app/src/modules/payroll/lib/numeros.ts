/**
 * Redondeo monetario del modulo de nomina.
 *
 * Existia TRES veces (bancoHoras, incapacidad, planilla) y no en la misma
 * version: la de incapacidad hacia `Math.round(value * 100) / 100` sin sumar
 * `Number.EPSILON`. Esa diferencia importa con dinero — el clasico
 * `1.005 * 100 = 100.49999999999999` en punto flotante redondea a 1.00 sin
 * EPSILON y a 1.01 con el. O sea: el mismo monto podia salir con un centimo
 * de diferencia segun por que calculo pasara.
 *
 * Se conserva la version CON `Number.EPSILON` (la que ya usaban dos de los
 * tres archivos, incluido `planilla`, el calculo principal).
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
