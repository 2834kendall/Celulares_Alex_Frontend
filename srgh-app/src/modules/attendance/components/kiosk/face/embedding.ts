import * as faceapi from '@vladmandic/face-api'
import { FACE_EMBEDDING_DIM, FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'
import { computeTestEmbedding } from './testEmbedding'

/**
 * Embedding facial con la red de reconocimiento de face-api.js (fork
 * mantenido @vladmandic/face-api) via TensorFlow.js. La imagen recortada del
 * rostro NUNCA sale de esta funcion: entra como un canvas y sale como un
 * arreglo de 128 numeros. El unico dato que viaja al servidor es ese vector,
 * y ademas cifrado (faceCrypto).
 *
 * Procedencia de los pesos (verificada antes de usarlos, no son de un repo
 * cualquiera): entrenados por davisking (creador de dlib) bajo Boost
 * Software License 1.0 — uso comercial permitido —, empaquetados para el
 * navegador por face-api.js (MIT, con confirmacion explicita del mantenedor
 * de que el uso comercial esta permitido). @vladmandic/face-api es el fork
 * activamente mantenido (el original quedo abandonado en 2020).
 *
 * Modo de prueba (NEXT_PUBLIC_FACE_TEST_MODE=true): salta el modelo real y
 * usa computeTestEmbedding (testEmbedding.ts) — un calculo determinista de
 * luminancia, NO reconocimiento facial real. Sirve de respaldo si faltan los
 * archivos de pesos (public/models/face-api/). Jamas debe activarse en
 * produccion.
 */

const MODEL_URL = '/models/face-api'
const TEST_MODE = process.env.NEXT_PUBLIC_FACE_TEST_MODE === 'true'

let modelLoadPromise: Promise<void> | null = null

function loadModel(): Promise<void> {
  if (!modelLoadPromise) {
    modelLoadPromise = faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL).catch((err) => {
      modelLoadPromise = null
      throw err
    })
  }
  return modelLoadPromise
}

/** Precarga el modelo (para pagar el costo al abrir el kiosco, no al marcar). */
export function preloadEmbeddingModel(): Promise<unknown> {
  if (TEST_MODE) return Promise.resolve()
  return loadModel()
}

/**
 * Calcula el embedding del recorte facial (canvas cuadrado ya escalado por
 * el llamador). face-api.js reescala internamente a los 150x150 que espera
 * su red — no hace falta preprocesar el tensor a mano.
 */
export async function computeEmbedding(faceCanvas: HTMLCanvasElement): Promise<number[]> {
  if (TEST_MODE) {
    const ctx = faceCanvas.getContext('2d')
    if (!ctx) throw new Error('Canvas sin contexto 2d.')
    const { data } = ctx.getImageData(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE)
    return computeTestEmbedding(data)
  }

  await loadModel()
  const raw = await faceapi.computeFaceDescriptor(faceCanvas)
  const descriptor = Array.isArray(raw) ? raw[0] : raw

  if (!descriptor || descriptor.length !== FACE_EMBEDDING_DIM) {
    throw new Error(
      `El modelo devolvio ${descriptor?.length ?? 0} dimensiones, esperaba ${FACE_EMBEDDING_DIM}.`
    )
  }

  // La distancia coseno (faceMath.ts) ya es invariante a la magnitud del
  // vector, asi que no hace falta L2-normalizar aca — el servidor tampoco lo
  // exige para el vector de verificacion (solo el de enrolamiento).
  return Array.from(descriptor)
}
