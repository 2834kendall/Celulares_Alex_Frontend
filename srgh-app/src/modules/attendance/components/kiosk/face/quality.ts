/**
 * Controles de calidad de la captura, como funciones PURAS (sin camara ni
 * MediaPipe). Se corren ANTES de gastar el modelo de embeddings y antes de
 * dar por buena una identificacion.
 *
 * No son una medida anti-foto —de eso se encarga antispoof.ts— sino de
 * PRECISION: un recorte pequeno, borroso o muy de perfil produce un descriptor
 * degradado, y un descriptor degradado acerca a personas distintas entre si.
 * En un kiosco con pocos empleados eso se traduce en marcar a alguien como
 * otro, que es el peor resultado posible del sistema.
 *
 * Orden respecto a la prueba de vida: estos controles corren ANTES, y solo
 * cuando pasan se le entrega el frame al clasificador. Asi no se gasta
 * inferencia en encuadres que igual se iban a descartar.
 */

export interface Point2D {
  x: number
  y: number
}

export type QualityIssue =
  /** El rostro ocupa muy poco del encuadre: acercarse. */
  | 'rostro_lejos'
  /** El rostro se sale del encuadre. */
  | 'rostro_cortado'
  /** Demasiado de perfil para un descriptor confiable. */
  | 'rostro_girado'
  /** Cabeza muy inclinada hacia un lado. */
  | 'rostro_inclinado'

export interface QualityReport {
  ok: boolean
  issues: QualityIssue[]
  /** Fraccion del lado menor del encuadre que ocupa el rostro. */
  coverage: number
  /** Desviacion de frontalidad, 0 = de frente. */
  yaw: number
  /** Inclinacion lateral en radianes, 0 = ojos nivelados. */
  roll: number
}

const RIGHT_EYE_OUTER = 33
const LEFT_EYE_OUTER = 263
const NOSE_TIP = 1
const CHIN = 152
const FOREHEAD = 10

export interface QualityOptions {
  /** Fraccion minima del encuadre que debe ocupar el rostro. */
  minCoverage?: number
  /** Desviacion maxima de frontalidad tolerada en la captura. */
  maxYaw?: number
  /** Inclinacion lateral maxima (radianes) tolerada en la captura. */
  maxRoll?: number
  /** Margen (fraccion del encuadre) que debe quedar libre en los bordes. */
  edgeMargin?: number
}

const DEFAULTS: Required<QualityOptions> = {
  // Un rostro que ocupa menos de ~28% del lado menor del encuadre llega al
  // modelo con pocos pixeles utiles despues del recorte a 150x150.
  minCoverage: 0.28,
  // ~0.25 unidades interoculares de desviacion de la nariz respecto al eje
  // de los ojos: permite un giro natural leve, corta el perfil marcado.
  maxYaw: 0.25,
  // ~17 grados de inclinacion lateral. Mas que eso y el alineado por rotacion
  // empieza a recortar frente o menton.
  maxRoll: 0.3,
  edgeMargin: 0.02,
}

/**
 * Desviacion de frontalidad SIN matriz de pose: se compara la posicion
 * horizontal de la punta de la nariz contra el punto medio entre los ojos,
 * normalizada por la distancia interocular. De frente la nariz cae en el
 * medio; al girar la cabeza se corre hacia un lado. Es una aproximacion
 * barata y suficiente para un umbral de calidad —no pretende ser una
 * estimacion metrica de angulo.
 */
export function frontalityOffset(landmarks: Point2D[]): number | null {
  const right = landmarks[RIGHT_EYE_OUTER]
  const left = landmarks[LEFT_EYE_OUTER]
  const nose = landmarks[NOSE_TIP]
  if (!right || !left || !nose) return null

  const interocular = Math.hypot(left.x - right.x, left.y - right.y)
  if (interocular <= 0) return null

  const midX = (left.x + right.x) / 2
  const midY = (left.y + right.y) / 2

  // Eje ojo-ojo unitario: proyectar el desplazamiento de la nariz sobre el,
  // para que una cabeza inclinada no se confunda con una girada.
  const ux = (left.x - right.x) / interocular
  const uy = (left.y - right.y) / interocular

  const along = (nose.x - midX) * ux + (nose.y - midY) * uy
  return Math.abs(along) / interocular
}

/** Inclinacion lateral (radianes) de la linea entre los ojos. */
export function rollAngle(landmarks: Point2D[]): number | null {
  const right = landmarks[RIGHT_EYE_OUTER]
  const left = landmarks[LEFT_EYE_OUTER]
  if (!right || !left) return null
  return Math.atan2(left.y - right.y, left.x - right.x)
}

/**
 * Fraccion del lado menor del encuadre que ocupa el rostro, medida de frente
 * a menton. Se usa la altura y no el ancho porque el ancho se acorta al girar
 * la cabeza y penalizaria una pose valida.
 */
export function faceCoverage(landmarks: Point2D[]): number | null {
  const forehead = landmarks[FOREHEAD]
  const chin = landmarks[CHIN]
  if (!forehead || !chin) return null
  return Math.abs(chin.y - forehead.y)
}

/** true si algun landmark se sale del encuadre util (con margen). */
export function isCropped(landmarks: Point2D[], margin: number): boolean {
  for (const p of landmarks) {
    if (!p) continue
    if (p.x < margin || p.x > 1 - margin) return true
    if (p.y < margin || p.y > 1 - margin) return true
  }
  return false
}

/**
 * Evalua el encuadre para la CAPTURA. Devuelve todos los problemas y no solo
 * el primero: la UI le dice a la persona todo lo que debe corregir de una vez,
 * en vez de hacerla adivinar de a un paso.
 */
export function assessQuality(
  landmarks: Point2D[],
  options: QualityOptions = {}
): QualityReport | null {
  const { minCoverage, maxYaw, maxRoll, edgeMargin } = { ...DEFAULTS, ...options }

  const coverage = faceCoverage(landmarks)
  const yaw = frontalityOffset(landmarks)
  const roll = rollAngle(landmarks)

  if (coverage === null || yaw === null || roll === null) return null

  const issues: QualityIssue[] = []

  if (coverage < minCoverage) issues.push('rostro_lejos')
  if (isCropped(landmarks, edgeMargin)) issues.push('rostro_cortado')
  if (yaw > maxYaw) issues.push('rostro_girado')
  if (Math.abs(roll) > maxRoll) issues.push('rostro_inclinado')

  return { ok: issues.length === 0, issues, coverage, yaw, roll }
}

/** Mensaje para la persona frente al kiosco. Prioriza el problema dominante. */
export function qualityMessage(issues: QualityIssue[]): string | null {
  if (issues.includes('rostro_lejos')) return 'Acercate un poco mas a la camara'
  if (issues.includes('rostro_cortado')) return 'Centra tu rostro en el recuadro'
  if (issues.includes('rostro_girado')) return 'Mira de frente a la camara'
  if (issues.includes('rostro_inclinado')) return 'Endereza un poco la cabeza'
  return null
}

/**
 * Varianza del laplaciano sobre la luminancia: la medida clasica de nitidez.
 * Un recorte borroso —o la foto de una foto, que casi siempre pierde
 * definicion— da varianza baja.
 *
 * Recibe el ImageData del recorte ya hecho, no del frame completo: el fondo
 * no debe influir en si la CARA esta nitida.
 */
export function sharpnessScore(image: ImageData): number {
  const { data, width, height } = image
  if (width < 3 || height < 3) return 0

  // Luminancia en una sola pasada (coeficientes Rec. 601).
  const luma = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let sum = 0
  let sumSq = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      // Kernel laplaciano de 4 vecinos.
      const value = 4 * luma[p] - luma[p - 1] - luma[p + 1] - luma[p - width] - luma[p + width]
      sum += value
      sumSq += value * value
      count++
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}
