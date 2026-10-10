/**
 * Upcoming birthdays for the dashboard.
 *
 * Everything here works on plain "YYYY-MM-DD" strings and UTC arithmetic,
 * never on the local clock: the caller passes "today" (the Costa Rica
 * calendar day), so the result is the same on the server, in any time zone,
 * and in tests.
 */

export interface BirthdaySource {
  id: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  fotoUrl: string | null
  /** Birth date as stored: "YYYY-MM-DD". */
  fechaNacimiento: string
}

/**
 * What reaches the browser. Deliberately WITHOUT the birth year (and so
 * without the age): the dashboard only needs to know when to celebrate.
 */
export interface UpcomingBirthday {
  id: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  fotoUrl: string | null
  /** 1–12 */
  month: number
  day: number
  /** 0 = today. */
  daysUntil: number
  /** "12 oct" */
  dateLabel: string
  /** "lunes" — of the next time it is celebrated. */
  weekday: string
}

const MS_PER_DAY = 86_400_000

export const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

export const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Someone born on Feb 29 celebrates on Feb 28 in the years without one. */
function celebrationDay(year: number, month: number, day: number) {
  return month === 2 && day === 29 && !isLeapYear(year) ? 28 : day
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day || month > 12 || day > 31) return null
  return { year, month, day }
}

type DateParts = { year: number; month: number; day: number }

/** This year's celebration of a date, or next year's if it already went by. */
function nextCelebrationMs(date: DateParts, today: DateParts) {
  const todayMs = Date.UTC(today.year, today.month - 1, today.day)
  let nextMs = 0
  for (const year of [today.year, today.year + 1]) {
    nextMs = Date.UTC(year, date.month - 1, celebrationDay(year, date.month, date.day))
    if (nextMs >= todayMs) break
  }
  return nextMs
}

export interface AnniversarySource {
  id: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  fotoUrl: string | null
  /** Date the person first joined the company: "YYYY-MM-DD". */
  fechaIngreso: string
}

export interface UpcomingAnniversary {
  id: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  fotoUrl: string | null
  /** Years of service they reach on that day. Always 1 or more. */
  years: number
  /** 0 = today. */
  daysUntil: number
  /** "12 oct" */
  dateLabel: string
  weekday: string
}

/**
 * Next work anniversary of each person, sorted from the closest to the
 * farthest. Whoever joined less than a year before their next "anniversary"
 * has none yet (it would be year 0) and is left out.
 */
export function toUpcomingAnniversaries(
  people: AnniversarySource[],
  todayIso: string
): UpcomingAnniversary[] {
  const today = parseIsoDate(todayIso)
  if (!today) return []

  const todayMs = Date.UTC(today.year, today.month - 1, today.day)
  const upcoming: UpcomingAnniversary[] = []

  for (const person of people) {
    const joined = parseIsoDate(person.fechaIngreso)
    if (!joined) continue

    const nextMs = nextCelebrationMs(joined, today)
    const next = new Date(nextMs)
    const years = next.getUTCFullYear() - joined.year
    if (years < 1) continue

    upcoming.push({
      id: person.id,
      nombre: person.nombre,
      puesto: person.puesto,
      sucursal: person.sucursal,
      fotoUrl: person.fotoUrl,
      years,
      daysUntil: Math.round((nextMs - todayMs) / MS_PER_DAY),
      dateLabel: `${next.getUTCDate()} ${MONTHS_SHORT[next.getUTCMonth()]}`,
      weekday: WEEKDAYS[next.getUTCDay()],
    })
  }

  return upcoming.sort((a, b) => a.daysUntil - b.daysUntil || a.nombre.localeCompare(b.nombre))
}

/**
 * Turns birth dates into the next time each one is celebrated, sorted from
 * the closest to the farthest. Rows with a malformed date are skipped.
 */
export function toUpcomingBirthdays(
  people: BirthdaySource[],
  todayIso: string
): UpcomingBirthday[] {
  const today = parseIsoDate(todayIso)
  if (!today) return []

  const todayMs = Date.UTC(today.year, today.month - 1, today.day)
  const upcoming: UpcomingBirthday[] = []

  for (const person of people) {
    const birth = parseIsoDate(person.fechaNacimiento)
    if (!birth) continue

    const nextMs = nextCelebrationMs(birth, today)
    const next = new Date(nextMs)
    upcoming.push({
      id: person.id,
      nombre: person.nombre,
      puesto: person.puesto,
      sucursal: person.sucursal,
      fotoUrl: person.fotoUrl,
      month: birth.month,
      day: birth.day,
      daysUntil: Math.round((nextMs - todayMs) / MS_PER_DAY),
      dateLabel: `${next.getUTCDate()} ${MONTHS_SHORT[next.getUTCMonth()]}`,
      weekday: WEEKDAYS[next.getUTCDay()],
    })
  }

  return upcoming.sort((a, b) => a.daysUntil - b.daysUntil || a.nombre.localeCompare(b.nombre))
}

export interface RecentHire {
  id: number
  nombre: string
  puesto: string | null
  sucursal: string | null
  fotoUrl: string | null
  /** 0 = joined today. */
  daysAgo: number
  /** "12 oct" */
  dateLabel: string
}

/**
 * Who joined within the last `windowDays`, newest first. A start date in the
 * future (someone loaded ahead of their first day) is left out: they have
 * not joined yet.
 */
export function toRecentHires(
  people: AnniversarySource[],
  todayIso: string,
  windowDays: number
): RecentHire[] {
  const today = parseIsoDate(todayIso)
  if (!today) return []

  const todayMs = Date.UTC(today.year, today.month - 1, today.day)
  const hires: RecentHire[] = []

  for (const person of people) {
    const joined = parseIsoDate(person.fechaIngreso)
    if (!joined) continue

    const daysAgo = Math.round(
      (todayMs - Date.UTC(joined.year, joined.month - 1, joined.day)) / MS_PER_DAY
    )
    if (daysAgo < 0 || daysAgo > windowDays) continue

    hires.push({
      id: person.id,
      nombre: person.nombre,
      puesto: person.puesto,
      sucursal: person.sucursal,
      fotoUrl: person.fotoUrl,
      daysAgo,
      dateLabel: `${joined.day} ${MONTHS_SHORT[joined.month - 1]}`,
    })
  }

  return hires.sort((a, b) => a.daysAgo - b.daysAgo || a.nombre.localeCompare(b.nombre))
}

/** "Hoy", "Ayer", "hace 6 días". */
export function agoLabel(daysAgo: number) {
  if (daysAgo === 0) return 'Hoy'
  if (daysAgo === 1) return 'Ayer'
  return `hace ${daysAgo} días`
}

/** "Hoy", "Mañana", "en 6 días". */
export function countdownLabel(daysUntil: number) {
  if (daysUntil === 0) return 'Hoy'
  if (daysUntil === 1) return 'Mañana'
  return `en ${daysUntil} días`
}
