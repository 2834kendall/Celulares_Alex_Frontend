import { diffMinutes } from '@/modules/attendance/lib/time'

export type DayAttendanceStatus =
  'a_tiempo' | 'tardio' | 'tardio_justificado' | 'ausente' | 'no_aplica'

/**
 * Un tipo de tardia del catalogo de la empresa (sgrh_cat_tipos_tardia).
 *
 * Solo guarda el minuto donde EMPIEZA: termina un minuto antes de que empiece
 * el siguiente, y el ultimo queda abierto. Asi es imposible configurar huecos
 * o solapamientos — ver la migracion del catalogo.
 */
export interface TardinessType {
  id: number
  nombre: string
  /** Minuto de atraso desde el que una entrada cae en este tipo. */
  desdeMinutos: number
  /** Si suma al conteo del mes que dispara la advertencia. */
  cuentaAdvertencia: boolean
  /** Hex, o null para el color por defecto. */
  color: string | null
}

/**
 * Los tres tipos que pidio el cliente (2026-09-17): leve desde el minuto 1,
 * tardia desde el 6, grave desde el 11. Son los que la migracion siembra en
 * cada empresa.
 *
 * Aca solo como red de seguridad: si por algun motivo una empresa se quedara
 * sin tipos, la alternativa seria no registrar ninguna tardanza, en silencio.
 * No deberia pasar — la migracion los crea para toda empresa, nueva o vieja,
 * y deleteTipoTardia no deja borrar el ultimo.
 */
export const DEFAULT_TARDINESS_TYPES: TardinessType[] = [
  { id: -1, nombre: 'Tardia leve', desdeMinutos: 1, cuentaAdvertencia: true, color: '#F59E0B' },
  { id: -2, nombre: 'Tardia', desdeMinutos: 6, cuentaAdvertencia: true, color: '#EA580C' },
  { id: -3, nombre: 'Tardia grave', desdeMinutos: 11, cuentaAdvertencia: true, color: '#E11D48' },
]

/** Lo que la pantalla necesita de un tipo para pintarlo: nombre y color. */
export type TardinessBadge = Pick<TardinessType, 'nombre' | 'color'>

/** Color para un tipo sin color propio: el ambar de la tardia leve. */
export const DEFAULT_TARDINESS_COLOR = '#F59E0B'

/**
 * Tipo de una tardanza segun los minutos de atraso, o null si no llego tarde.
 *
 * "Llegar tarde" empieza en el minuto del PRIMER tipo: un atraso menor no es
 * tardanza. Ese umbral cumple el papel que antes tenia la tolerancia por
 * sucursal, que el catalogo reemplazo.
 */
export function classifyTardiness(
  minutosDeAtraso: number,
  tipos: TardinessType[]
): TardinessType | null {
  let match: TardinessType | null = null

  for (const tipo of [...tipos].sort((a, b) => a.desdeMinutos - b.desdeMinutos)) {
    if (minutosDeAtraso >= tipo.desdeMinutos) match = tipo
    else break
  }

  return match
}

export interface DayForInfraction {
  /** Ausencia aprobada que cubre este dia (vacaciones, incapacidad, permiso). */
  isJustifiedAbsence: boolean
  isDayOff: boolean
  isHoliday: boolean
  /** "HH:mm" esperado segun la programacion. null si no hay programacion ese dia. */
  expectedStart: string | null
  /** "HH:mm" de la marca de entrada. null si no marco. */
  entradaTime: string | null
  /**
   * Un encargado declaro que esta tardanza no es responsabilidad del
   * colaborador (el sistema fallo y no pudo marcar estando ya en tienda, u
   * otro caso que el o el administrador analicen). Se sigue viendo en el
   * reporte, pero no cuenta.
   */
  isJustifiedTardiness: boolean
  /**
   * "HH:mm" en que debia terminar el almuerzo, y en que se marco el fin.
   * Opcionales: un dia sin almuerzo programado o sin marcarlo simplemente
   * no tiene tardanza de regreso (SGRH-88).
   */
  expectedLunchEnd?: string | null
  finAlmuerzoTime?: string | null
  /** Justificacion de la tardanza al volver del almuerzo, sobre su propia marca. */
  isJustifiedLunchTardiness?: boolean
}

/**
 * El tipo de tardia de un dia, o null si no hubo: dia que no aplica, sin
 * marca de entrada, o llegada antes del primer tipo del catalogo.
 */
export function tardinessOfDay(
  day: DayForInfraction,
  tipos: TardinessType[]
): TardinessType | null {
  if (day.isJustifiedAbsence || day.isDayOff || day.isHoliday) return null
  if (!day.expectedStart || !day.entradaTime) return null

  return classifyTardiness(diffMinutes(day.entradaTime, day.expectedStart), tipos)
}

/**
 * Clasifica un dia para efectos de tardias/ausencias (RF-07/RF-08). Dia libre,
 * feriado, sin programacion o cubierto por una ausencia justificada no cuentan
 * ni a favor ni en contra ("no_aplica").
 *
 * La ausencia justificada se evalua PRIMERO y gana sobre todo lo demas: el
 * horario semanal se publica antes de que la gente se enferme, asi que el dia
 * sigue programado y con hora esperada. Sin esta rama, una incapacidad
 * aprobada se leia como ausencia y disparaba la advertencia del mes (SGRH-72).
 *
 * La tardanza justificada, en cambio, se distingue de la que no lo esta
 * ('tardio_justificado' vs 'tardio') en vez de volverse "a tiempo": el atraso
 * ocurrio y el reporte tiene que poder mostrarlo, solo que sin sumarlo.
 */
export function classifyDay(day: DayForInfraction, tipos: TardinessType[]): DayAttendanceStatus {
  if (day.isJustifiedAbsence || day.isDayOff || day.isHoliday || !day.expectedStart) {
    return 'no_aplica'
  }

  if (!day.entradaTime) {
    return 'ausente'
  }

  if (!tardinessOfDay(day, tipos)) {
    return 'a_tiempo'
  }

  return day.isJustifiedTardiness ? 'tardio_justificado' : 'tardio'
}

/**
 * Si la tardanza de este dia suma para la advertencia del mes: tiene que ser
 * una tardanza, no estar justificada, y ser de un tipo que cuente.
 */
/**
 * Tipo de tardia al VOLVER del almuerzo, o null si volvio a tiempo, el dia no
 * aplica o falta alguna de las dos horas (SGRH-88).
 *
 * Se clasifica con el MISMO catalogo que la entrada: volver 3 minutos tarde
 * del almuerzo es una tardia leve igual que entrar 3 minutos tarde. Dos
 * escalas distintas serian dos reglas que nadie recuerda.
 */
export function lunchTardinessOfDay(
  day: DayForInfraction,
  tipos: TardinessType[]
): TardinessType | null {
  if (day.isJustifiedAbsence || day.isDayOff || day.isHoliday) return null
  if (!day.expectedLunchEnd || !day.finAlmuerzoTime) return null

  return classifyTardiness(diffMinutes(day.finAlmuerzoTime, day.expectedLunchEnd), tipos)
}

/** Si la tardanza al volver del almuerzo suma para la advertencia del mes. */
export function lunchCountsTowardWarning(day: DayForInfraction, tipos: TardinessType[]): boolean {
  if (day.isJustifiedLunchTardiness) return false
  return lunchTardinessOfDay(day, tipos)?.cuentaAdvertencia ?? false
}

/**
 * Minutos que un periodo (almuerzo o receso) se paso de lo permitido; 0 si
 * no se paso. Recibe "HH:mm" de inicio y fin reales.
 */
export function periodExcessMinutes(
  inicio: string,
  fin: string,
  minutosPermitidos: number
): number {
  return Math.max(0, diffMinutes(fin, inicio) - minutosPermitidos)
}

/**
 * Minutos de receso pagados: solo el exceso sobre esto se descuenta de las
 * horas. Es la misma regla que modules/schedules/lib/hours.ts
 * (PAID_BREAK_MINUTES); se repite aca porque cada modulo de negocio es
 * independiente. Si una cambia, la otra tiene que cambiar con ella.
 */
export const PAID_BREAK_MINUTES = 10

export function countsTowardWarning(day: DayForInfraction, tipos: TardinessType[]): boolean {
  if (classifyDay(day, tipos) !== 'tardio') return false
  return tardinessOfDay(day, tipos)?.cuentaAdvertencia ?? false
}

export interface MonthlyInfractionSummary {
  tardias: number
  ausencias: number
}

export function summarizeMonth(
  days: DayForInfraction[],
  tipos: TardinessType[]
): MonthlyInfractionSummary {
  let tardias = 0
  let ausencias = 0

  for (const day of days) {
    // Un mismo dia puede sumar dos tardias: al entrar y al volver del almuerzo.
    if (lunchCountsTowardWarning(day, tipos)) tardias++
    if (countsTowardWarning(day, tipos)) tardias++
    else if (classifyDay(day, tipos) === 'ausente') ausencias++
  }

  return { tardias, ausencias }
}

/**
 * Regla temporal hardcodeada (decision del equipo, 2026-07-26): 3 tardias o
 * 1 ausencia en el mes disparan la advertencia. Pendiente de discutir si
 * pasa a ser configurable por el gerente (ver backlog de SGRH-21).
 *
 * Que tipos suman lo decide cada empresa en su catalogo
 * (tta_cuenta_advertencia); por defecto cuentan los tres, asi que tres leves
 * ya avisan (decision del cliente, 2026-09-17).
 */
const TARDIAS_LIMITE = 3
const AUSENCIAS_LIMITE = 1

export function shouldWarn(summary: MonthlyInfractionSummary): boolean {
  return summary.tardias >= TARDIAS_LIMITE || summary.ausencias >= AUSENCIAS_LIMITE
}
