const COSTA_RICA_TIME_ZONE = 'America/Costa_Rica'

/**
 * Costa Rica no observa horario de verano, asi que el desfase con UTC es
 * siempre -6. Aun asi se usa Intl con timeZone explicito (no getHours() del
 * Date local) porque el proceso de Node puede correr en cualquier zona
 * horaria segun el hosting — normalmente UTC — y confiar en la hora local
 * del sistema desfasaria cada marca esas mismas 6 horas.
 */
function partsInCostaRica(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COSTA_RICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Hora de pared de Costa Rica para un instante dado, en el formato naive
 * "YYYY-MM-DD HH:mm:ss" que espera mar_fecha_hora (timestamp without time
 * zone): sin sufijo de zona, para que Postgres lo guarde tal cual.
 */
export function formatInCostaRica(date: Date): string {
  const { year, month, day, hour, minute, second } = partsInCostaRica(date)
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/** El "ahora" de Costa Rica, listo para insertarse en mar_fecha_hora. */
export function nowInCostaRica(): string {
  return formatInCostaRica(new Date())
}

/** El dia calendario de Costa Rica, en "YYYY-MM-DD" — puede diferir del dia UTC. */
export function todayInCostaRica(): string {
  return nowInCostaRica().split(' ')[0]
}

/** Suma (o resta, con delta negativo) dias calendario a una fecha "YYYY-MM-DD". */
export function shiftISODate(dateISO: string, deltaDays: number): string {
  const date = new Date(`${dateISO}T00:00:00`)
  date.setDate(date.getDate() + deltaDays)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Valida el formato y la existencia real de una fecha "YYYY-MM-DD" (ej. el ?date= de la URL). */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

/** Extrae "HH:mm" de un valor "YYYY-MM-DD HH:mm:ss" (o "HH:mm:ss" suelto). */
export function timeOfDay(fechaHora: string): string {
  const timePart = fechaHora.includes(' ') ? fechaHora.split(' ')[1] : fechaHora
  return timePart.slice(0, 5)
}

/** Convierte "HH:mm" (o "HH:mm:ss") a minutos desde medianoche. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Diferencia en minutos entre la hora marcada y la esperada. Positivo = tarde,
 * negativo = temprano. Es un dato neutro: NO clasifica la marca como tardia
 * ni aplica ninguna tolerancia — ese calculo queda fuera de este ticket.
 */
export function diffMinutes(actualHHMM: string, expectedHHMM: string): number {
  return toMinutes(actualHHMM) - toMinutes(expectedHHMM)
}
