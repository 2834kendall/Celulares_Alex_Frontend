/**
 * Formats a date as YYYY-MM-DD using the LOCAL calendar.
 * Do not use toISOString() for this: it converts to UTC, which shifts the
 * date back a day in timezones ahead of UTC.
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getWeekDates(anyDateISO: string): string[] {
  const d = new Date(anyDateISO + 'T00:00:00')
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)

  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return toISODate(dt)
  })
}

export function currentMondayISO(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + diff)
  return toISODate(now)
}

/** Corre el lunes de referencia N semanas (negativo hacia atras) para las flechas del navegador. */
export function shiftWeekISO(mondayISO: string, weeks: number): string {
  const d = new Date(`${mondayISO}T00:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return toISODate(d)
}

/** Validates the format and real existence of a YYYY-MM-DD date (e.g. the URL's ?week=). */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

export const WEEKDAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]
