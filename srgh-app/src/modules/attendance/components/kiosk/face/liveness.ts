/**
 * Prueba de vida por parpadeo, como maquina de estados PURA (sin camara ni
 * MediaPipe): recibe los scores de los blendshapes eyeBlinkLeft/eyeBlinkRight
 * de cada frame y decide. Separarla del hardware la hace testeable y deja al
 * componente de camara como un simple acarreador de frames.
 *
 * Secuencia exigida: ojos ABIERTOS (linea base) → CERRADOS → ABIERTOS de
 * nuevo. Una foto impresa o una pantalla estatica no produce esa transicion.
 *
 * Lentes oscuros: MediaPipe no puede estimar el parpadeo si no ve los ojos,
 * asi que los scores nunca cruzan el umbral de cierre → nunca hay parpadeo →
 * al agotarse el tiempo se falla A PROPOSITO con 'sin_parpadeo', y la UI pide
 * descubrirse el rostro. Ese timeout ES la regla de los lentes oscuros.
 */

export interface BlinkSample {
  /** Score 0..1 del blendshape eyeBlinkLeft (1 = ojo cerrado). */
  blinkLeft: number
  /** Score 0..1 del blendshape eyeBlinkRight. */
  blinkRight: number
  timestampMs: number
}

export type LivenessStatus =
  /** Aun sin linea base de ojos abiertos. */
  | 'esperando_ojos'
  /** Linea base lista; esperando el cierre de ambos ojos. */
  | 'esperando_parpadeo'
  /** Parpadeo completo detectado: persona viva. */
  | 'vivo'
  /** Se agoto el tiempo sin ver un parpadeo (ojos tapados o lentes oscuros). */
  | 'sin_parpadeo'

export interface LivenessOptions {
  /** Score minimo (ambos ojos) para considerar el ojo cerrado. */
  closeThreshold?: number
  /** Score maximo (ambos ojos) para considerar el ojo abierto. */
  openThreshold?: number
  /** Tiempo total para completar el parpadeo antes de fallar. */
  timeoutMs?: number
}

export interface LivenessTracker {
  push(sample: BlinkSample): LivenessStatus
  status(): LivenessStatus
}

const DEFAULTS: Required<LivenessOptions> = {
  closeThreshold: 0.5,
  openThreshold: 0.25,
  timeoutMs: 8000,
}

export function createLivenessTracker(options: LivenessOptions = {}): LivenessTracker {
  const { closeThreshold, openThreshold, timeoutMs } = { ...DEFAULTS, ...options }

  let phase: 'baseline' | 'esperando_cierre' | 'esperando_apertura' = 'baseline'
  let result: LivenessStatus | null = null
  let startMs: number | null = null

  function classify(sample: BlinkSample): 'abiertos' | 'cerrados' | 'intermedio' {
    if (sample.blinkLeft >= closeThreshold && sample.blinkRight >= closeThreshold) {
      return 'cerrados'
    }
    if (sample.blinkLeft <= openThreshold && sample.blinkRight <= openThreshold) {
      return 'abiertos'
    }
    return 'intermedio'
  }

  function currentStatus(): LivenessStatus {
    if (result) return result
    return phase === 'baseline' ? 'esperando_ojos' : 'esperando_parpadeo'
  }

  return {
    push(sample: BlinkSample): LivenessStatus {
      if (result) return result

      if (startMs === null) startMs = sample.timestampMs

      if (sample.timestampMs - startMs > timeoutMs) {
        result = 'sin_parpadeo'
        return result
      }

      const eyes = classify(sample)

      if (phase === 'baseline') {
        if (eyes === 'abiertos') phase = 'esperando_cierre'
      } else if (phase === 'esperando_cierre') {
        if (eyes === 'cerrados') phase = 'esperando_apertura'
      } else if (phase === 'esperando_apertura') {
        if (eyes === 'abiertos') {
          result = 'vivo'
          return result
        }
      }

      return currentStatus()
    },
    status: currentStatus,
  }
}
