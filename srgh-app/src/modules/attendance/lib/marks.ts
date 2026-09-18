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
}

type JourneySlot = keyof Omit<DayJourney, 'duplicates' | 'isOpen'>

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
export function groupIntoDayJourney(marks: RawMark[]): DayJourney {
  const sorted = [...marks].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))

  const journey: DayJourney = {
    entrada: null,
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    duplicates: [],
    isOpen: false,
  }

  for (const mark of sorted) {
    const slot = SLOT_OF[mark.tipo]
    if (journey[slot] === null) {
      journey[slot] = mark
    } else {
      journey.duplicates.push(mark)
    }
  }

  journey.isOpen = journey.entrada !== null && journey.salida === null

  return journey
}

/**
 * Las marcas que tienen sentido AHORA, dada la jornada hasta aca (SGRH-88).
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
 */
export function allowedNextMarks(journey: DayJourney): MarkType[] {
  if (!journey.entrada) return ['entrada']
  if (journey.salida) return []

  if (journey.inicioReceso && !journey.finReceso) return ['fin_receso']
  if (journey.inicioAlmuerzo && !journey.finAlmuerzo) return ['fin_almuerzo']

  const next: MarkType[] = []
  if (!journey.inicioReceso) next.push('inicio_receso')
  if (!journey.inicioAlmuerzo) next.push('inicio_almuerzo')
  next.push('salida')

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
