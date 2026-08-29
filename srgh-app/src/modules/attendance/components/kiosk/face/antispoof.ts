/**
 * Anti-spoofing por ANALISIS DE MATERIAL (MiniFASNetV2 sobre onnxruntime-web).
 *
 * POR QUE ESTO Y NO GEOMETRIA: los intentos previos midieron la geometria de
 * los landmarks de MediaPipe (planaridad por homografia) y fueron burlados con
 * una foto en la pantalla de un telefono. La razon es de fondo: los landmarks
 * NO son features crudos de la imagen, son la proyeccion de un modelo 3D
 * canonico de rostro que la red ajusta a lo que ve. Ante una foto plana igual
 * encaja su malla 3D, y al inclinar el telefono el modelo RE-AJUSTA y genera
 * desplazamientos que imitan paralaje real. Medido en camara: una foto llego a
 * dar correlacion error-profundidad de 0.707, MAS ALTA que un rostro real
 * (0.450). Ningun estadistico construido sobre esos landmarks puede limpiar
 * una senal que ya viene contaminada por el prior del modelo.
 *
 * Este clasificador no mira geometria: mira el MATERIAL — grano de impresion,
 * muare de pantalla, reflejo especular, gama de color, bordes y marco. Una
 * pantalla sigue siendo una pantalla por mucha malla 3D que MediaPipe alucine
 * encima. Y por lo mismo es indiferente a los LENTES, que fue el requisito que
 * descarto al parpadeo desde el principio.
 *
 * PROCEDENCIA (verificada antes de integrar, ver public/models/README.md):
 * pesos de minivision-ai/Silent-Face-Anti-Spoofing bajo Apache-2.0.
 *
 * CONVENCION DE ENTRADA — VERIFICADA EMPIRICAMENTE, NO LEIDA:
 * la ficha del modelo publicada rio abajo documentaba MAL dos cosas criticas,
 * y creerle habria significado desplegar un clasificador saturado E invertido.
 * Contrastando contra las imagenes de muestra del repo oficial (que traen la
 * verdad en el nombre: image_T1 real, image_F1/F2 falsas) se determino que lo
 * correcto es:
 *
 *   - Pixeles en rango 0..255 SIN dividir (la ficha decia dividir por 255; el
 *     grafo ONNX ya lleva esa escala adentro, asi que dividir de nuevo satura
 *     la red y devuelve practicamente la misma salida para cualquier imagen).
 *   - Orden de canales BGR (con RGB el modelo clasifica todo como real).
 *   - Clase 1 = REAL; clases 0 y 2 = ataque (la ficha decia clase 0 = real;
 *     el test.py oficial de minivision confirma que es la 1).
 *
 * Margenes medidos con esa convencion: imagen real 0.999, foto de foto 0.011.
 */

const MODEL_URL = '/models/antispoof/minifasnet_v2.onnx'
const WASM_PATH = '/models/ort/'

/** Lado (px) de la entrada del modelo. */
export const ANTISPOOF_INPUT = 80

/**
 * Factor de expansion de la caja del rostro antes de recortar. Viene del
 * nombre del checkpoint oficial (2.7_80x80_MiniFASNetV2) y no es arbitrario:
 * el modelo fue entrenado viendo ese CONTEXTO alrededor de la cara, que es
 * justo donde aparecen las pistas del ataque (el marco del telefono, el borde
 * del papel, el reflejo de la pantalla). Recortar mas ajustado le quita
 * exactamente la evidencia que necesita.
 */
export const ANTISPOOF_SCALE = 2.7

/** Indice de la clase "rostro real" en la salida. Ver nota de convencion. */
export const REAL_CLASS_INDEX = 1

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Caja de recorte segun _get_new_box del repo oficial. Dos detalles que
 * importan y que no son obvios:
 *   1. Conserva la RELACION DE ASPECTO de la caja original (no la vuelve
 *      cuadrada): el modelo se entreno asi.
 *   2. Si la caja expandida se sale del frame, la DESPLAZA hacia adentro en
 *      vez de recortarla, para no cambiar su tamano.
 */
export function antispoofCropBox(
  bbox: BoundingBox,
  frameWidth: number,
  frameHeight: number,
  scale: number = ANTISPOOF_SCALE
): CropRect | null {
  if (frameWidth <= 1 || frameHeight <= 1) return null
  if (bbox.width <= 0 || bbox.height <= 0) return null

  // La escala se limita para que la caja expandida quepa en el frame.
  const limited = Math.min((frameHeight - 1) / bbox.height, (frameWidth - 1) / bbox.width, scale)

  const newWidth = bbox.width * limited
  const newHeight = bbox.height * limited
  const centerX = bbox.x + bbox.width / 2
  const centerY = bbox.y + bbox.height / 2

  let left = centerX - newWidth / 2
  let top = centerY - newHeight / 2
  let right = centerX + newWidth / 2
  let bottom = centerY + newHeight / 2

  if (left < 0) {
    right -= left
    left = 0
  }
  if (top < 0) {
    bottom -= top
    top = 0
  }
  if (right > frameWidth - 1) {
    left -= right - (frameWidth - 1)
    right = frameWidth - 1
  }
  if (bottom > frameHeight - 1) {
    top -= bottom - (frameHeight - 1)
    bottom = frameHeight - 1
  }

  left = Math.max(0, left)
  top = Math.max(0, top)

  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Caja del rostro (en pixeles) a partir de los landmarks normalizados. */
export function landmarksBoundingBox(
  landmarks: { x: number; y: number }[],
  frameWidth: number,
  frameHeight: number
): BoundingBox | null {
  if (landmarks.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of landmarks) {
    if (!p) continue
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  if (!Number.isFinite(maxX) || !Number.isFinite(maxY)) return null

  const x = minX * frameWidth
  const y = minY * frameHeight
  const width = (maxX - minX) * frameWidth
  const height = (maxY - minY) * frameHeight

  return width > 0 && height > 0 ? { x, y, width, height } : null
}

/**
 * ImageData (RGBA) a tensor NCHW en orden BGR y rango 0..255. Ver la nota de
 * convencion arriba: NO se divide por 255 a proposito.
 */
export function preprocess(image: ImageData): Float32Array {
  const { data, width, height } = image
  const pixels = width * height
  const out = new Float32Array(3 * pixels)

  for (let i = 0; i < pixels; i++) {
    const o = i * 4
    out[i] = data[o + 2] // B
    out[pixels + i] = data[o + 1] // G
    out[2 * pixels + i] = data[o] // R
  }

  return out
}

/** Softmax numericamente estable. */
export function softmax(logits: number[]): number[] {
  if (logits.length === 0) return []
  const max = Math.max(...logits)
  const exps = logits.map((v) => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return sum > 0 ? exps.map((v) => v / sum) : logits.map(() => 0)
}

/**
 * Probabilidad de que el rostro sea real, a partir de los logits crudos.
 * Devuelve null si la salida no tiene la forma esperada — antes que adivinar
 * con una salida rara, el llamador debe tratarlo como "no se pudo evaluar".
 */
export function realnessFromLogits(logits: number[]): number | null {
  if (logits.length !== 3) return null
  if (!logits.every((v) => Number.isFinite(v))) return null
  return softmax(logits)[REAL_CLASS_INDEX]
}

type OrtModule = typeof import('onnxruntime-web/wasm')
type Session = Awaited<ReturnType<OrtModule['InferenceSession']['create']>>

let ortPromise: Promise<OrtModule> | null = null
let sessionPromise: Promise<Session> | null = null

/**
 * onnxruntime-web entra por import dinamico igual que MediaPipe y face-api:
 * al evaluarse toca APIs que solo existen en el navegador, y el arbol del
 * kiosco tambien se evalua en el servidor al renderizar.
 *
 * Se importa el subpath /wasm, NO el paquete raiz: la entrada por defecto es
 * la build con WebGPU y pide ort-wasm-simd-threaded.JSEP.wasm (27 MB), que no
 * se copia a /public. Con la raiz, la carga fallaba con 404 y el kiosco
 * mostraba "No se pudieron cargar los modelos de reconocimiento". El subpath
 * /wasm pide ort-wasm-simd-threaded.wasm, que es el que si se copia.
 */
function getOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web/wasm')
      .then((ort) => {
        // Los .wasm se sirven desde /public/models/ort, no desde un CDN: el
        // kiosco no puede depender de internet en runtime. Van bajo models/
        // porque esa ruta ya esta exenta del guard de sesion (ver proxy.ts).
        ort.env.wasm.wasmPaths = WASM_PATH
        // Un solo hilo: los workers multihilo de onnxruntime exigen aislamiento
        // de origen cruzado (COOP/COEP), cabeceras que este kiosco no sirve.
        // Con un modelo de 1.7 MB la inferencia toma ~10-25 ms igual.
        ort.env.wasm.numThreads = 1
        return ort
      })
      .catch((err) => {
        ortPromise = null
        throw err
      })
  }
  return ortPromise
}

function getSession(): Promise<Session> {
  if (!sessionPromise) {
    sessionPromise = getOrt()
      .then((ort) => ort.InferenceSession.create(MODEL_URL))
      .catch((err) => {
        sessionPromise = null
        throw err
      })
  }
  return sessionPromise
}

/** Precarga modelo y runtime (para pagar el costo al abrir el kiosco). */
export function preloadAntispoofModel(): Promise<unknown> {
  return getSession()
}

/**
 * Puntaje de realidad (0..1) del rostro presente en `source`. Recorta con la
 * convencion oficial a partir de los landmarks, corre el modelo y devuelve la
 * probabilidad de la clase real. null si no se pudo evaluar.
 */
export async function scoreRealness(
  source: CanvasImageSource,
  landmarks: { x: number; y: number }[],
  frameWidth: number,
  frameHeight: number
): Promise<number | null> {
  const bbox = landmarksBoundingBox(landmarks, frameWidth, frameHeight)
  if (!bbox) return null

  const rect = antispoofCropBox(bbox, frameWidth, frameHeight)
  if (!rect || rect.width <= 0 || rect.height <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = ANTISPOOF_INPUT
  canvas.height = ANTISPOOF_INPUT
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    ANTISPOOF_INPUT,
    ANTISPOOF_INPUT
  )

  const tensorData = preprocess(ctx.getImageData(0, 0, ANTISPOOF_INPUT, ANTISPOOF_INPUT))

  const ort = await getOrt()
  const session = await getSession()
  const output = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', tensorData, [
      1,
      3,
      ANTISPOOF_INPUT,
      ANTISPOOF_INPUT,
    ]),
  })

  const raw = output[session.outputNames[0]]?.data
  if (!raw) return null

  return realnessFromLogits(Array.from(raw as Float32Array))
}
