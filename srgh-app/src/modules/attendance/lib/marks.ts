import { diffMinutes } from '@/modules/attendance/lib/time'

/**
 * Vocabulario de mar_tipo. En minuscula: es la convencion real del resto del
 * esquema para columnas de texto equivalentes (ntf_tipo_notificacion,
 * aus_estado, npe_estado, etc.) — no hay CHECK en la base de datos que lo
 * fuerce, la validacion vive solo en la aplicacion (ver types.ts). Por eso,
 * para sumar los tipos del receso (SGRH-88), no hizo falta migracion.
 */
export const MARK_TYPES = [
  'entrada',
  'inicio_receso',
  'fin_receso',
  'inicio_almuerzo',
  'fin_almuerzo',
  'salida',
] as const

export type MarkType = (typeof MARK_TYPES)[number]

/** Nombre de cada marca para mostrar, en el orden natural de la jornada. */
export const MARK_LABELS: Record<MarkType, string> = {
  entrada: 'Entrada',
  inicio_receso: 'Inicio de receso',
  fin_receso: 'Fin de receso',
  inicio_almuerzo: 'Inicio de almuerzo',
  fin_almuerzo: 'Fin de almuerzo',
  salida: 'Salida',
}

export interface RawMark {
  id: number
  tipo: MarkType
  /** "YYYY-MM-DD HH:mm:ss", hora de pared de Costa Rica (ver lib/time.ts). */
  fechaHora: string
}

/** Un bloque de trabajo marcado: su entrada y, si ya cerro, su salida. */
export interface JourneyBlock {
  entrada: RawMark
  salida: RawMark | null
}

export interface DayJourney {
  entrada: RawMark | null
  inicioReceso: RawMark | null
  finReceso: RawMark | null
  inicioAlmuerzo: RawMark | null
  finAlmuerzo: RawMark | null
  salida: RawMark | null
  /** Marcas del mismo tipo mas alla de la primera considerada valida. */
  duplicates: RawMark[]
  /** Hay entrada pero no salida: la jornada quedo abierta. */
  isOpen: boolean
  /**
   * Bloques marcados del dia (SGRH-110): con jornada partida, o con un tramo
   * por sucursal, cada bloque tiene su entrada y su salida. Solo se llena si
   * quien llama pide `byBlocks` y el dia son dos o mas pares entrada/salida;
   * en cualquier otro caso es [] y el dia se lee como siempre.
   */
  blocks: JourneyBlock[]
}

type JourneySlot = keyof Omit<DayJourney, 'duplicates' | 'isOpen' | 'blocks'>

const SLOT_OF: Record<MarkType, JourneySlot> = {
  entrada: 'entrada',
  inicio_receso: 'inicioReceso',
  fin_receso: 'finReceso',
  inicio_almuerzo: 'inicioAlmuerzo',
  fin_almuerzo: 'finAlmuerzo',
  salida: 'salida',
}

/**
 * Agrupa las marcas sueltas de UN empleado en UN dia (el filtro por dia y
 * empleado es responsabilidad de quien llama) en una jornada.
 *
 * Cuando un tipo se repite (doble toque por error, reintento tras fallo),
 * se toma la PRIMERA marca cronologica como la valida: el toque accidental
 * casi siempre ocurre despues del real, no antes. Las demas quedan en
 * `duplicates` para que el encargado las revise/corrija, nunca se descartan.
 */
export function groupIntoDayJourney(
  marks: RawMark[],
  options: { byBlocks?: boolean } = {}
): DayJourney {
  const sorted = [...marks].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))
  const blocks = options.byBlocks ? pairIntoBlocks(sorted) : null

  const journey: DayJourney = {
    entrada: null,
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    duplicates: [],
    isOpen: false,
    blocks: [],
  }

  for (const mark of sorted) {
    // Las entradas y salidas de un dia por bloques no son duplicados: cada par
    // es un bloque. El resto (receso, almuerzo) sigue la regla de siempre.
    if (blocks && (mark.tipo === 'entrada' || mark.tipo === 'salida')) continue
    const slot = SLOT_OF[mark.tipo]
    if (journey[slot] === null) {
      journey[slot] = mark
    } else {
      journey.duplicates.push(mark)
    }
  }

  if (blocks) {
    // El dia va de la primera entrada a la ultima salida; si el ultimo bloque
    // sigue abierto no hay salida y la jornada queda abierta.
    journey.blocks = blocks
    journey.entrada = blocks[0].entrada
    journey.salida = blocks[blocks.length - 1].salida
  }

  journey.isOpen = journey.entrada !== null && journey.salida === null

  return journey
}

/**
 * Entradas y salidas de un dia de varios bloques (8 entra, 12 sale, 13 entra,
 * 17 sale), o null si el dia no tiene esa forma: menos de dos entradas, o
 * marcas que no alternan entrada/salida empezando por una entrada (un doble
 * toque, una salida suelta). Esos casos se leen como siempre, con los
 * repetidos en `duplicates` para que el encargado los revise.
 *
 * Si la ultima marca es una entrada, el ultimo bloque queda abierto.
 */
function pairIntoBlocks(sorted: RawMark[]): JourneyBlock[] | null {
  const es = sorted.filter((m) => m.tipo === 'entrada' || m.tipo === 'salida')
  if (es.filter((m) => m.tipo === 'entrada').length < 2) return null
  if (!es.every((m, i) => m.tipo === (i % 2 === 0 ? 'entrada' : 'salida'))) return null

  const blocks: JourneyBlock[] = []
  for (let i = 0; i < es.length; i += 2) {
    blocks.push({ entrada: es[i], salida: es[i + 1] ?? null })
  }
  return blocks
}

/**
 * Cuanto antes de su hora de salida se puede marcar la salida. Quince
 * minutos: cubre a quien ya cerro y esta guardando, sin volver util el
 * boton a media jornada — tocarlo por error a las 10 de la mañana cerraba
 * el dia y dejaba a la persona sin poder marcar nada mas (SGRH-88).
 */
export const EXIT_WINDOW_TOLERANCE_MINUTES = 15

/**
 * Si a esta hora ya se puede marcar la SALIDA: desde quince minutos antes
 * de la hora programada en adelante. No tiene tope por arriba — quien se
 * queda de mas tiene que poder cerrar su jornada.
 *
 * Sin hora de salida programada devuelve true: no hay nada que respetar.
 */
export function isExitWindowOpen(
  now: string,
  expectedEnd: string | null | undefined,
  tolerancia: number = EXIT_WINDOW_TOLERANCE_MINUTES
): boolean {
  if (!expectedEnd) return true

  return diffMinutes(now, expectedEnd) >= -tolerancia
}

/** El aviso de que su horario no contempla receso. */
export function describeNoBreak() {
  return 'Tu horario no tiene receso asignado. Avisa al encargado si necesitas uno.'
}

/** Ya tomo el receso del dia, en este u otro bloque o sucursal (SGRH-120). */
export function describeBreakTaken() {
  return 'Ya tomaste tu receso de hoy. El receso es uno por día.'
}

/** El aviso de que todavia no es la hora de salir. */
export function describeExitWindow(expectedEnd: string) {
  return `Tu salida es a las ${expectedEnd}. Si necesitas salir antes, avisa al encargado.`
}

/** * Las marcas que tienen sentido AHORA, dada la jornada hasta aca (SGRH-88).
 * El kiosco solo ofrece estas, y registerKioskMark rechaza cualquier otra:
 * esconder un boton no es una regla, la accion es invocable directamente.
 *
 * Dos reglas y nada mas:
 *  - un periodo abierto (receso o almuerzo) bloquea todo menos su propio
 *    cierre — no se puede salir ni empezar el almuerzo con el receso abierto;
 *  - cada periodo se toma una vez por dia.
 * Antes de la entrada solo se puede entrar, y despues de la salida no queda
 * nada que marcar.
 *
 * No exige haber tomado el almuerzo para salir: que pasa cuando no se toma
 * esta fuera de alcance (decision del cliente, 2026-09-17), y bloquear la
 * salida solo obligaria a inventar marcas de almuerzo para poder irse.
 *
 * El receso solo se ofrece si el horario del dia lo contempla: preguntarle
 * por un receso a quien no lo tiene invita a tomarlo (SGRH-88).
 *
 * La salida, en cambio, SI respeta la hora del horario (ver
 * isExitWindowOpen): a destiempo suele ser un toque por error que cierra el
 * dia (decision del cliente, 2026-09-19).
 *
 * El almuerzo no: cada quien lo toma a la hora que quiera (SGRH-95, que
 * revierte la ventana de SGRH-88). Lo que se controla es que no pase de una
 * hora desde que se marca el inicio — ver lunchLateMinutes en lib/infractions.ts.
 */
export function allowedNextMarks(
  journey: DayJourney,
  ventanas: {
    exitWindowOpen?: boolean
    /** El horario del dia contempla receso. Si no, no hay nada que marcar. */
    breakScheduled?: boolean
  } = {}
): MarkType[] {
  const { exitWindowOpen = true, breakScheduled = true } = ventanas
  if (!journey.entrada) return ['entrada']
  if (journey.salida) return []

  if (journey.inicioReceso && !journey.finReceso) return ['fin_receso']
  if (journey.inicioAlmuerzo && !journey.finAlmuerzo) return ['fin_almuerzo']

  const next: MarkType[] = []
  if (!journey.inicioReceso && breakScheduled) next.push('inicio_receso')
  if (!journey.inicioAlmuerzo) next.push('inicio_almuerzo')
  if (exitWindowOpen) next.push('salida')

  return next
}

/**
 * Por que se rechazo una marca fuera de secuencia, dicho de forma que la
 * persona frente al kiosco sepa que hacer.
 */
export function describeSequenceRejection(tipo: MarkType, allowed: MarkType[]): string {
  if (allowed.length === 0) return 'Ya registraste tu salida de hoy.'

  const opciones = allowed.map((t) => MARK_LABELS[t].toLowerCase()).join(', ')
  return `No corresponde marcar ${MARK_LABELS[tipo].toLowerCase()} ahora. Puedes marcar: ${opciones}.`
}
