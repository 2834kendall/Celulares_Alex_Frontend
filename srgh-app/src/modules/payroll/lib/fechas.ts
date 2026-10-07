/**
 * Fechas locales del modulo de nomina, sin pasar por `Date.toISOString()`.
 *
 * Toda la nomina razona en dias calendario de Costa Rica (periodos,
 * quincenas, fecha de pago). `toISOString()` convierte a UTC, asi que en
 * UTC-6 cualquier momento despues de las 18:00 locales ya reporta el dia
 * SIGUIENTE — un pago marcado el 31 a las 19:00 quedaria registrado el 1 del
 * mes siguiente, en otro periodo de planilla.
 */

const ZONA_COSTA_RICA = 'America/Costa_Rica'

/**
 * Fecha y hora de pared de Costa Rica para un instante.
 *
 * Con Intl y la zona explícita, no con getDate()/getHours() del proceso: el
 * servidor corre en la zona que tenga el hosting (normalmente UTC), y con la
 * hora del proceso un pago marcado el 31 a las 19:00 de Costa Rica quedaba
 * con fecha del 1. Asistencia ya lo hacía así (attendance/lib/time.ts).
 */
function partesEnCostaRica(instante: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_COSTA_RICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante)
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00'
  return {
    fecha: `${parte('year')}-${parte('month')}-${parte('day')}`,
    hora: `${parte('hour')}:${parte('minute')}:${parte('second')}`,
  }
}

/** 'YYYY-MM-DD' del dia de hoy en Costa Rica. */
export function hoyLocal(instante: Date = new Date()): string {
  return partesEnCostaRica(instante).fecha
}

/**
 * 'YYYY-MM-DD HH:mm:ss' de este momento, en hora de Costa Rica.
 *
 * Es el formato que espera un `timestamp without time zone` de Postgres, que
 * guarda la hora tal cual se la manda sin convertir nada. Mandarle un
 * `toISOString()` guardaria la hora UTC como si fuera local: en Costa Rica
 * (UTC-6) todo quedaria seis horas adelantado, y una planilla leida a las
 * 19:00 del 31 diria que se leyo a la 01:00 del 1.
 */
export function ahoraLocal(instante: Date = new Date()): string {
  const { fecha, hora } = partesEnCostaRica(instante)
  return `${fecha} ${hora}`
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
