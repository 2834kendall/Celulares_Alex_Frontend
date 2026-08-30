/**
 * Fechas locales del modulo de nomina, sin pasar por `Date.toISOString()`.
 *
 * Toda la nomina razona en dias calendario de Costa Rica (periodos,
 * quincenas, fecha de pago). `toISOString()` convierte a UTC, asi que en
 * UTC-6 cualquier momento despues de las 18:00 locales ya reporta el dia
 * SIGUIENTE — un pago marcado el 31 a las 19:00 quedaria registrado el 1 del
 * mes siguiente, en otro periodo de planilla.
 */

/** 'YYYY-MM-DD' del dia de hoy en horario local. */
export function hoyLocal(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

/**
 * Convierte 'YYYY-MM-DD' a un `Date` a medianoche LOCAL.
 *
 * `new Date('2026-08-29')` lo interpreta como UTC y en Costa Rica devuelve el
 * 28 a las 18:00; construyendo con (anio, mes, dia) queda el dia correcto.
 */
export function parseFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}
