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
  /** El rostro ocupa mas que el ovalo: alejarse. */
  | 'rostro_cerca'
  /** El rostro no queda dentro del ovalo que se muestra en pantalla. */
  | 'fuera_del_ovalo'
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
  /**
   * Ovalo guia en coordenadas del video (ver ovalInVideo). Si se pasa, el
   * rostro tiene que quedar adentro: lo que la persona ve en pantalla es lo
   * que se exige (SGRH-117). Antes bastaba con no tocar el borde del cuadro.
   */
  oval?: Oval | null
}

/** Elipse en coordenadas normalizadas (0 a 1) del cuadro de video. */
export interface Oval {
  cx: number
  cy: number
  rx: number
  ry: number
}

/**
 * Ovalo de la pantalla traducido al cuadro del video. FaceScan muestra el
 * video con `object-cover` en un recuadro 4:3 y dibuja el ovalo al 50% del
 * ancho y 75% del alto. Si la camara entrega otra proporcion (16:9 es comun),
 * el recuadro recorta los costados (o arriba y abajo) y el ovalo cubre una
 * fraccion distinta del cuadro real.
 */
export function ovalInVideo(
  videoWidth: number,
  videoHeight: number,
  displayAspect = 4 / 3,
  widthShare = 0.5,
  heightShare = 0.75
): Oval {
  let rx = widthShare / 2
  let ry = heightShare / 2
  if (videoWidth > 0 && videoHeight > 0) {
    const aspect = videoWidth / videoHeight
    if (aspect > displayAspect) rx *= displayAspect / aspect
    else if (aspect < displayAspect) ry *= aspect / displayAspect
  }
  return { cx: 0.5, cy: 0.5, rx, ry }
}

/**
 * Holgura sobre el ovalo dibujado: el trazo tiene grosor y la persona no
 * apunta al pixel. Mas que esto ya se ve claramente afuera.
 */
const OVAL_TOLERANCE = 1.1
/** Puntos del rostro que tienen que caer dentro (deja pasar el pelo suelto del borde). */
const OVAL_MIN_SHARE = 0.95

/** true si (casi) todos los puntos del rostro caen dentro del ovalo. */
export function faceInsideOval(landmarks: Point2D[], oval: Oval): boolean {
  let inside = 0
  let total = 0
  for (const p of landmarks) {
    if (!p) continue
    total++
    const dx = (p.x - oval.cx) / (oval.rx * OVAL_TOLERANCE)
    const dy = (p.y - oval.cy) / (oval.ry * OVAL_TOLERANCE)
    if (dx * dx + dy * dy <= 1) inside++
  }
  return total > 0 && inside / total >= OVAL_MIN_SHARE
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
  oval: null,
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
  const { minCoverage, maxYaw, maxRoll, edgeMargin, oval } = { ...DEFAULTS, ...options }

  const coverage = faceCoverage(landmarks)
  const yaw = frontalityOffset(landmarks)
  const roll = rollAngle(landmarks)

  if (coverage === null || yaw === null || roll === null) return null

  const issues: QualityIssue[] = []

  if (coverage < minCoverage) issues.push('rostro_lejos')
  if (oval) {
    // De frente a menton mas alto que el ovalo: no hay forma de que entre.
    if (coverage > oval.ry * 2 * OVAL_TOLERANCE) issues.push('rostro_cerca')
    else if (!faceInsideOval(landmarks, oval)) issues.push('fuera_del_ovalo')
  }
  if (isCropped(landmarks, edgeMargin)) issues.push('rostro_cortado')
  if (yaw > maxYaw) issues.push('rostro_girado')
  if (Math.abs(roll) > maxRoll) issues.push('rostro_inclinado')

  return { ok: issues.length === 0, issues, coverage, yaw, roll }
}

/** Mensaje para la persona frente al kiosco. Prioriza el problema dominante. */
export function qualityMessage(issues: QualityIssue[]): string | null {
  if (issues.includes('rostro_lejos')) return 'Acércate un poco más a la cámara'
  if (issues.includes('rostro_cerca')) return 'Aléjate un poco de la cámara'
  if (issues.includes('fuera_del_ovalo')) return 'Coloca tu rostro dentro del óvalo'
  if (issues.includes('rostro_cortado')) return 'Centra tu rostro en el recuadro'
  if (issues.includes('rostro_girado')) return 'Mira de frente a la cámara'
  if (issues.includes('rostro_inclinado')) return 'Endereza un poco la cabeza'
  return null
}

/** Mensaje cuando los ojos quedan tapados por lentes oscuros (registro, SGRH-117). */
export const DARK_GLASSES_MESSAGE = 'Quítate los lentes oscuros'

/** Imagen minima que necesita eyeShade: la de un canvas o un ImageData. */
export interface PixelGrid {
  data: Uint8ClampedArray | number[]
  width: number
  height: number
}

/** Contorno de cada ojo en la malla de MediaPipe (rabillos, parpados). */
const RIGHT_EYE = [33, 133, 159, 145, 160, 144, 158, 153]
const LEFT_EYE = [263, 362, 386, 374, 387, 373, 385, 380]
/**
 * Piel de referencia del MISMO rostro: mejillas y frente. Comparar contra la
 * propia piel, y no contra un brillo fijo, hace la medida independiente del
 * tono de piel y de la exposicion de la camara.
 */
const SKIN_POINTS = [50, 280, 205, 425, 151]

function luma(img: PixelGrid, x: number, y: number): number {
  const i = (y * img.width + x) * 4
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
}

/** Brillo medio de un rectangulo (en coordenadas normalizadas). */
function meanLuma(img: PixelGrid, x0: number, y0: number, x1: number, y1: number): number | null {
  const ax = Math.max(0, Math.floor(Math.min(x0, x1) * img.width))
  const bx = Math.min(img.width - 1, Math.ceil(Math.max(x0, x1) * img.width))
  const ay = Math.max(0, Math.floor(Math.min(y0, y1) * img.height))
  const by = Math.min(img.height - 1, Math.ceil(Math.max(y0, y1) * img.height))
  let sum = 0
  let n = 0
  for (let y = ay; y <= by; y++) {
    for (let x = ax; x <= bx; x++) {
      sum += luma(img, x, y)
      n++
    }
  }
  return n > 0 ? sum / n : null
}

function eyeLuma(img: PixelGrid, landmarks: Point2D[], indices: number[]): number | null {
  const pts = indices.map((i) => landmarks[i]).filter(Boolean)
  if (pts.length < 4) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return meanLuma(img, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
}

/**
 * Cuan oscuro se ve cada ojo respecto de la piel del mismo rostro: 1 = igual
 * de claro, 0 = negro. Un ojo descubierto (o tras un lente claro) mezcla
 * esclerotica, iris y pestanas, y sale bastante por encima de unos lentes de
 * sol, que dejan la zona casi negra. null si faltan puntos.
 */
export function eyeShade(
  img: PixelGrid,
  landmarks: Point2D[]
): { right: number; left: number } | null {
  const right = landmarks[RIGHT_EYE_OUTER]
  const left = landmarks[LEFT_EYE_OUTER]
  if (!right || !left) return null
  const half = Math.hypot(left.x - right.x, left.y - right.y) * 0.08
  if (!(half > 0)) return null

  const skin: number[] = []
  for (const i of SKIN_POINTS) {
    const p = landmarks[i]
    if (!p) continue
    const v = meanLuma(img, p.x - half, p.y - half, p.x + half, p.y + half)
    if (v !== null) skin.push(v)
  }
  if (skin.length < 3) return null
  const skinLuma = skin.reduce((a, b) => a + b, 0) / skin.length
  if (skinLuma < 1) return null

  const r = eyeLuma(img, landmarks, RIGHT_EYE)
  const l = eyeLuma(img, landmarks, LEFT_EYE)
  if (r === null || l === null) return null
  return { right: r / skinLuma, left: l / skinLuma }
}

/**
 * Umbral CONSERVADOR: bloquear un registro bueno es peor para el admin que
 * dejar pasar un caso raro, y ademas la unicidad en el servidor queda como
 * red. Se exigen LOS DOS ojos: una sombra de luz cenital o un mechon suele
 * caer sobre uno, unos lentes tapan ambos. Calibrar con NEXT_PUBLIC_FACE_DEBUG.
 */
export const DARK_EYES_RATIO = 0.35

export function looksLikeDarkGlasses(
  shade: { right: number; left: number } | null,
  threshold = DARK_EYES_RATIO
): boolean {
  return shade !== null && shade.right < threshold && shade.left < threshold
}

/** Mensaje cuando hay una mano sobre la cara (registro, SGRH-117). */
export const HAND_ON_FACE_MESSAGE = 'Quita la mano de la cara'

/**
 * Puntos de la mano que tienen que caer dentro del rostro para darlo por
 * tapado. Uno o dos pueden rozar el borde con la mano apoyada en el menton o
 * pasando cerca; tres ya son dedos o palma encima de la cara.
 */
const HAND_POINTS_ON_FACE = 3

/**
 * true si alguna mano tapa parte del rostro: cuenta los puntos de cada mano
 * (21 por mano, en coordenadas normalizadas como los del rostro) que caen
 * dentro de la caja que encierra los puntos del rostro.
 *
 * El Face Landmarker no sirve para esto: ajusta un modelo 3D completo aunque
 * la mitad de la cara este cubierta, asi que los puntos del rostro salen
 * "bien" con la mano encima.
 */
export function handCoversFace(face: Point2D[], hands: Point2D[][]): boolean {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of face) {
    if (!p) continue
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return false

  return hands.some(
    (hand) =>
      hand.filter((p) => p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY).length >=
      HAND_POINTS_ON_FACE
  )
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

/** Measurements for device calibration. Defaults reject only degenerate frames. */
export function assessPixels(image: ImageData, minSharpness = 0, minLight = 0, maxLight = 255) {
  let light = 0
  for (let i = 0; i < image.data.length; i += 4) {
    light += 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
  }
  light /= image.width * image.height
  const sharpness = sharpnessScore(image)
  return {
    light,
    sharpness,
    ok:
      Number.isFinite(light) &&
      Number.isFinite(sharpness) &&
      sharpness > minSharpness &&
      light > minLight &&
      light < maxLight,
  }
}
