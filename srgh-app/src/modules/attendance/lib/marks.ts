/**
 * Vocabulario de mar_tipo. En minuscula: es la convencion real del resto del
 * esquema para columnas de texto equivalentes (ntf_tipo_notificacion,
 * aus_estado, npe_estado, etc.) — no hay CHECK en la base de datos que lo
 * fuerce, la validacion vive solo en la aplicacion (ver types.ts).
 */
export const MARK_TYPES = ['entrada', 'salida', 'inicio_almuerzo', 'fin_almuerzo'] as const

export type MarkType = (typeof MARK_TYPES)[number]

export interface RawMark {
  id: number
  tipo: MarkType
  /** "YYYY-MM-DD HH:mm:ss", hora de pared de Costa Rica (ver lib/time.ts). */
  fechaHora: string
}

export interface DayJourney {
  entrada: RawMark | null
  salida: RawMark | null
  inicioAlmuerzo: RawMark | null
  finAlmuerzo: RawMark | null
  /** Marcas del mismo tipo mas alla de la primera considerada valida. */
  duplicates: RawMark[]
  /** Hay entrada pero no salida: la jornada quedo abierta. */
  isOpen: boolean
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
    salida: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    duplicates: [],
    isOpen: false,
  }

  const slotOf: Record<MarkType, keyof Omit<DayJourney, 'duplicates' | 'isOpen'>> = {
    entrada: 'entrada',
    salida: 'salida',
    inicio_almuerzo: 'inicioAlmuerzo',
    fin_almuerzo: 'finAlmuerzo',
  }

  for (const mark of sorted) {
    const slot = slotOf[mark.tipo]
    if (journey[slot] === null) {
      journey[slot] = mark
    } else {
      journey.duplicates.push(mark)
    }
  }

  journey.isOpen = journey.entrada !== null && journey.salida === null

  return journey
}
