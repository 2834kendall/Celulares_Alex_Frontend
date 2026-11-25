/**
 * Lo que la persona VE durante el escaneo, como funcion pura (SGRH-117):
 * tono del ovalo, cuanto se llena el anillo y el mensaje de la franja. Se
 * prueba sin camara; FaceScan solo le pasa el estado del loop.
 *
 * El anillo NO cuenta tomas: representa "sostener la posicion". Si la persona
 * se mueve o se tapa la cara, se vacia y la franja dice por que, asi el
 * reinicio se lee como "quedate quieto de nuevo" y no como "perdiste 2 de 3"
 * (lo que frustraba con las tres barritas).
 */

export type ScanPhase =
  'iniciando' | 'buscando_rostro' | 'ajusta_encuadre' | 'evaluando' | 'capturando' | 'listo'

export type ScanTone = 'neutral' | 'warn' | 'progress' | 'done'

export interface ScanVisual {
  tone: ScanTone
  /** 0 a 1: cuanto se llena el anillo. */
  progress: number
  message: string
}

export interface ScanVisualInput {
  phase: ScanPhase
  /** Indicacion concreta (acercarse, quitar la mano…) cuando hay que corregir. */
  hint?: string | null
  /** Lecturas de la prueba de vida juntadas y las necesarias para decidir. */
  livenessSamples?: number
  livenessNeeded?: number
  /** Avance de la captura una vez confirmada la vida, de 0 a 1. */
  captureProgress?: number
}

/**
 * Parte del anillo que cubre la prueba de vida. Es la etapa de duracion
 * incierta (la mediana puede caer en la zona muerta), asi que se le da la
 * mayor parte pero nunca llega sola al final.
 */
export const LIVENESS_SHARE = 0.6

const MESSAGES = {
  iniciando: 'Preparando el reconocimiento…',
  buscando_rostro: 'Coloca tu rostro dentro del óvalo',
  ajusta_encuadre: 'Acomoda tu rostro dentro del óvalo',
  quieto: 'Quédate quieto, mirando a la cámara',
  listo: 'Listo, ya puedes moverte',
} as const

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export function getScanVisual(input: ScanVisualInput): ScanVisual {
  const { phase, hint } = input

  switch (phase) {
    case 'iniciando':
      return { tone: 'neutral', progress: 0, message: MESSAGES.iniciando }
    case 'buscando_rostro':
      return { tone: 'neutral', progress: 0, message: MESSAGES.buscando_rostro }
    case 'ajusta_encuadre':
      return { tone: 'warn', progress: 0, message: hint || MESSAGES.ajusta_encuadre }
    case 'evaluando': {
      const needed = input.livenessNeeded ?? 0
      const ratio = needed > 0 ? clamp01((input.livenessSamples ?? 0) / needed) : 0
      return {
        tone: hint ? 'warn' : 'progress',
        progress: LIVENESS_SHARE * ratio,
        message: hint || MESSAGES.quieto,
      }
    }
    case 'capturando':
      return {
        tone: hint ? 'warn' : 'progress',
        progress: LIVENESS_SHARE + (1 - LIVENESS_SHARE) * clamp01(input.captureProgress ?? 0),
        message: hint || MESSAGES.quieto,
      }
    case 'listo':
      return { tone: 'done', progress: 1, message: MESSAGES.listo }
  }
}

/**
 * Respiro antes de cambiar el texto de la franja (ver useSettledLabel en
 * FaceScan): la mano y el encuadre se evaluan en cada cuadro, y sin esto el
 * texto y el lector de pantalla cambiarian varias veces por segundo.
 */
export const MESSAGE_HOLD_MS = 400
