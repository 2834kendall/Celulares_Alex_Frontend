/**
 * Prueba de vida por MICRO-MOVIMIENTO PASIVO — no le pide nada a la persona
 * (a diferencia del parpadeo). Como maquina de estados PURA (sin camara ni
 * MediaPipe): recibe los 478 puntos de la cara de cada frame y decide.
 *
 * Idea: una foto impresa sostenida con la mano se mueve como UN SOLO BLOQUE
 * RIGIDO frente a la camara — todos sus puntos se trasladan/rotan/escalan
 * juntos, exactamente igual. Una cara real, aunque la persona trate de
 * quedarse quieta, tiene micro-movimientos INDEPENDIENTES entre zonas
 * (comisuras de la boca, nariz, menton se mueven un poco distinto entre si
 * por micro-expresiones involuntarias). Se mide esa deformacion no-rigida
 * proyectando puntos "propensos a moverse" (boca, nariz, menton) a un
 * sistema de coordenadas local anclado en las esquinas externas de los ojos
 * (que se mueven rigidamente CON la cabeza/foto, sirven de referencia
 * invariante a traslacion/rotacion/escala) y viendo cuanto varian esas
 * coordenadas locales a lo largo de una ventana de tiempo.
 *
 * Mas debil que el parpadeo (que es imposible de falsificar con una foto:
 * un papel no puede parpadear) — el ruido propio de la deteccion de
 * landmarks puede generar variacion aunque el objeto sea rigido. Por eso es
 * el chequeo PRIMARIO pero no el unico: si no logra confianza a tiempo, el
 * llamador (FaceScan.tsx) cae al parpadeo como respaldo.
 */

export interface FaceLandmark {
  x: number
  y: number
}

export interface MotionLivenessFrame {
  landmarks: FaceLandmark[]
  timestampMs: number
}

export type MotionLivenessStatus =
  /** Recolectando frames, todavia sin suficiente ventana para decidir. */
  | 'recolectando'
  /** Deformacion no-rigida detectada: persona viva. */
  | 'vivo'
  /** Se agoto el tiempo sin confianza suficiente — el llamador debe caer a parpadeo. */
  | 'requiere_parpadeo'

export interface MotionLivenessOptions {
  /** Ventana de tiempo que se analiza para decidir (ms). */
  windowMs?: number
  /** Minimo de frames en la ventana antes de intentar decidir. */
  minFrames?: number
  /**
   * Rango minimo (normalizado por distancia interocular) que deben mostrar
   * los puntos propensos a moverse para considerarse "vivo". Calibrado de
   * forma conservadora; puede necesitar ajuste con pruebas reales de camara.
   */
  nonRigidThreshold?: number
  /** Tiempo total antes de rendirse y pedir caer a parpadeo (ms). */
  timeoutMs?: number
}

export interface MotionLivenessTracker {
  push(frame: MotionLivenessFrame): MotionLivenessStatus
  status(): MotionLivenessStatus
}

// nonRigidThreshold subio de 0.012 a 0.035 (2026-07-31): una foto sostenida
// a mano se detecto pasando el chequeo en pruebas reales — el temblor de
// mano introduce un tilt fuera de plano frente a la camara (paralaje) que
// toLocalFrame no puede cancelar del todo, ya que solo normaliza traslacion,
// rotacion y escala EN el plano, no perspectiva. Subir el umbral achica esa
// ventana de falso positivo a costa de mas casos que caen al respaldo de
// parpadeo. Sigue siendo un chequeo 2D sin profundidad: mitiga, no elimina
// el riesgo, y puede necesitar mas ajuste con pruebas reales de camara.
const DEFAULTS: Required<MotionLivenessOptions> = {
  windowMs: 900,
  minFrames: 5,
  nonRigidThreshold: 0.035,
  timeoutMs: 2500,
}

// Indices del face mesh de MediaPipe (topologia estandar de 468/478 puntos).
const RIGHT_EYE_OUTER = 33
const LEFT_EYE_OUTER = 263
/** Puntos con mayor probabilidad de micro-movimiento independiente (expresion). */
const EXPRESSION_POINTS = [61, 291, 1, 152] // comisuras de boca, punta de nariz, menton

/**
 * Coordenadas de `point` en el sistema local anclado en el eje ojo-ojo:
 * invariante a traslacion, rotacion Y escala del rostro/foto completo — si
 * el objeto se mueve rigido, estas coordenadas NO cambian entre frames.
 */
function toLocalFrame(point: FaceLandmark, eyeA: FaceLandmark, eyeB: FaceLandmark): FaceLandmark {
  const baseX = eyeB.x - eyeA.x
  const baseY = eyeB.y - eyeA.y
  const baseLen = Math.sqrt(baseX * baseX + baseY * baseY)
  if (baseLen === 0) return { x: 0, y: 0 }

  const ux = baseX / baseLen
  const uy = baseY / baseLen
  // Perpendicular unitario (rotar 90 grados).
  const vx = -uy
  const vy = ux

  const relX = point.x - eyeA.x
  const relY = point.y - eyeA.y

  return {
    x: (relX * ux + relY * uy) / baseLen,
    y: (relX * vx + relY * vy) / baseLen,
  }
}

/**
 * Puntaje de deformacion no-rigida: promedio, entre los puntos de expresion,
 * del rango (max-min) de sus coordenadas locales a lo largo de la ventana.
 * 0 = se movio exactamente como un bloque rigido (o no hubo movimiento).
 */
export function computeNonRigidityScore(frames: MotionLivenessFrame[]): number {
  if (frames.length < 2) return 0

  const localSeries: FaceLandmark[][] = EXPRESSION_POINTS.map(() => [])

  for (const frame of frames) {
    const eyeA = frame.landmarks[RIGHT_EYE_OUTER]
    const eyeB = frame.landmarks[LEFT_EYE_OUTER]
    if (!eyeA || !eyeB) continue

    EXPRESSION_POINTS.forEach((idx, i) => {
      const point = frame.landmarks[idx]
      if (!point) return
      localSeries[i].push(toLocalFrame(point, eyeA, eyeB))
    })
  }

  const ranges = localSeries.map((series) => {
    if (series.length < 2) return 0
    const xs = series.map((p) => p.x)
    const ys = series.map((p) => p.y)
    const rangeX = Math.max(...xs) - Math.min(...xs)
    const rangeY = Math.max(...ys) - Math.min(...ys)
    return Math.max(rangeX, rangeY)
  })

  return ranges.reduce((sum, r) => sum + r, 0) / ranges.length
}

export function createMotionLivenessTracker(
  options: MotionLivenessOptions = {}
): MotionLivenessTracker {
  const { windowMs, minFrames, nonRigidThreshold, timeoutMs } = { ...DEFAULTS, ...options }

  const buffer: MotionLivenessFrame[] = []
  let result: MotionLivenessStatus | null = null
  let startMs: number | null = null

  function currentStatus(): MotionLivenessStatus {
    return result ?? 'recolectando'
  }

  return {
    push(frame: MotionLivenessFrame): MotionLivenessStatus {
      if (result) return result

      if (startMs === null) startMs = frame.timestampMs

      buffer.push(frame)
      while (buffer.length > 0 && frame.timestampMs - buffer[0].timestampMs > windowMs) {
        buffer.shift()
      }

      if (buffer.length >= minFrames) {
        const score = computeNonRigidityScore(buffer)
        if (score >= nonRigidThreshold) {
          result = 'vivo'
          return result
        }
      }

      if (frame.timestampMs - startMs > timeoutMs) {
        result = 'requiere_parpadeo'
        return result
      }

      return currentStatus()
    },
    status: currentStatus,
  }
}
