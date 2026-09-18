import { diffMinutes } from '@/modules/attendance/lib/time'

export type DayAttendanceStatus =
  'a_tiempo' | 'tardio' | 'tardio_justificado' | 'ausente' | 'no_aplica'

/** Gravedad de una tardanza. El orden es el de la escala, de menor a mayor. */
export const TARDINESS_LEVELS = ['leve', 'tardia', 'grave'] as const

export type TardinessLevel = (typeof TARDINESS_LEVELS)[number]

/**
 * Cortes de la escala, en minutos de atraso (SGRH-87, pedido del cliente el
 * 2026-09-17, en sus palabras: "si entraba 10:00 y entro 10:01 ya es tardia,
 * solamente que la podriamos catalogar como tardia leve, despues de 5 minutos
 * tardia, y mas de 10, tardia moderada o grave").
 *
 * "Despues de 5" es a partir del minuto 6 y "mas de 10" a partir del 11, asi
 * que los cortes son cerrados por arriba: leve 1-5, tardia 6-10, grave 11+.
 */
const HASTA_LEVE = 5
const HASTA_TARDIA = 10

/**
 * Banda de una tardanza segun los minutos de atraso, o null si no llego
 * tarde. NO aplica tolerancia: recibe el atraso crudo y solo lo clasifica.
 * Quien decide si ese atraso cuenta como tardanza es classifyDay, que si
 * conoce la tolerancia de la sucursal.
 */
export function classifyTardiness(minutosDeAtraso: number): TardinessLevel | null {
  if (minutosDeAtraso <= 0) return null
  if (minutosDeAtraso <= HASTA_LEVE) return 'leve'
  if (minutosDeAtraso <= HASTA_TARDIA) return 'tardia'
  return 'grave'
}

export const TARDINESS_LABEL: Record<TardinessLevel, string> = {
  leve: 'Tardia leve',
  tardia: 'Tardia',
  grave: 'Tardia grave',
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
  toleranciaMinutos: number
  /**
   * Un encargado declaro que esta tardanza no es responsabilidad del
   * colaborador (el sistema fallo y no pudo marcar estando ya en tienda, u
   * otro caso que el o el administrador analicen). Se sigue viendo en el
   * reporte, pero no cuenta.
   */
  isJustifiedTardiness: boolean
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
export function classifyDay(day: DayForInfraction): DayAttendanceStatus {
  if (day.isJustifiedAbsence || day.isDayOff || day.isHoliday || !day.expectedStart) {
    return 'no_aplica'
  }

  if (!day.entradaTime) {
    return 'ausente'
  }

  if (diffMinutes(day.entradaTime, day.expectedStart) <= day.toleranciaMinutos) {
    return 'a_tiempo'
  }

  return day.isJustifiedTardiness ? 'tardio_justificado' : 'tardio'
}

export interface MonthlyInfractionSummary {
  tardias: number
  ausencias: number
}

export function summarizeMonth(days: DayForInfraction[]): MonthlyInfractionSummary {
  let tardias = 0
  let ausencias = 0

  for (const day of days) {
    const status = classifyDay(day)
    if (status === 'tardio') tardias++
    else if (status === 'ausente') ausencias++
  }

  return { tardias, ausencias }
}

/**
 * Regla temporal hardcodeada (decision del equipo, 2026-07-26): 3 tardias o
 * 1 ausencia en el mes disparan la advertencia. Pendiente de discutir si
 * pasa a ser configurable por el gerente (ver backlog de SGRH-21).
 *
 * Las tres tardias cuentan igual sin importar la banda — tres leves ya
 * avisan (decision del cliente, 2026-09-17). La banda esta para que el
 * encargado vea la gravedad en el reporte, no para filtrar el conteo.
 */
const TARDIAS_LIMITE = 3
const AUSENCIAS_LIMITE = 1

export function shouldWarn(summary: MonthlyInfractionSummary): boolean {
  return summary.tardias >= TARDIAS_LIMITE || summary.ausencias >= AUSENCIAS_LIMITE
}
