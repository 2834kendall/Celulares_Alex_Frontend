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
 * 'YYYY-MM-DD HH:mm:ss' de este momento, en horario local.
 *
 * Es el formato que espera un `timestamp without time zone` de Postgres, que
 * guarda la hora tal cual se la manda sin convertir nada. Mandarle un
 * `toISOString()` guardaria la hora UTC como si fuera local: en Costa Rica
 * (UTC-6) todo quedaria seis horas adelantado, y una planilla leida a las
 * 19:00 del 31 diria que se leyo a la 01:00 del 1.
 */
export function ahoraLocal(): string {
  const ahora = new Date()
  const dos = (n: number) => String(n).padStart(2, '0')
  return (
    `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())} ` +
    `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}:${dos(ahora.getSeconds())}`
  )
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

/** 'YYYY-MM-DD' a partir de anio, mes (1-12) y dia. */
function fechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Ultimo dia del mes (1-12). El dia 0 del mes siguiente es el ultimo de este. */
export function ultimoDiaDelMes(mes: number, anio: number): number {
  return new Date(anio, mes, 0).getDate()
}

/**
 * Fechas que le corresponden a una quincena: la 1a va del 1 al 15 y la 2a del
 * 16 al ultimo dia del mes (28, 29, 30 o 31 segun el mes y el anio).
 *
 * Es lo que el formulario usa para llenar las fechas solo, y lo que el
 * servidor usa para validar las que llegan. Antes las dos fechas se escribian
 * a mano y nada revisaba que tuvieran que ver con el mes y la quincena
 * elegidos: se podia crear "Julio - 1a quincena" con fechas de septiembre, y
 * como de esas fechas salen las horas de asistencia, la planilla quedaba
 * calculada sobre el periodo equivocado sin que nada avisara.
 *
 * Devuelve null si el mes, el anio o la quincena no son validos, para que
 * quien llame decida que hacer en vez de recibir un rango inventado.
 */
export function rangoQuincena(
  mes: number,
  anio: number,
  quincena: number
): { inicio: string; fin: string } | null {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null
  if (!Number.isInteger(anio) || anio < 1) return null
  if (quincena !== 1 && quincena !== 2) return null

  if (quincena === 1) {
    return { inicio: fechaISO(anio, mes, 1), fin: fechaISO(anio, mes, 15) }
  }
  return { inicio: fechaISO(anio, mes, 16), fin: fechaISO(anio, mes, ultimoDiaDelMes(mes, anio)) }
}
