import * as ort from 'onnxruntime-web'
import { l2Normalize } from '@/modules/attendance/lib/face/faceMath'
import { FACE_EMBEDDING_DIM, FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'
import { rgbaToNchwFloat32 } from './preprocess'

/**
 * Embedding facial con MobileFaceNet (.onnx) via ONNX Runtime Web. La imagen
 * recortada del rostro NUNCA sale de esta funcion: entra como pixeles de un
 * canvas y sale como un arreglo de 128 numeros. El unico dato que viaja al
 * servidor es ese vector, y ademas cifrado (faceCrypto).
 */

const MODEL_URL = '/models/mobilefacenet.onnx'
const ORT_WASM_PATH = '/models/ort-wasm/'

let sessionPromise: Promise<ort.InferenceSession> | null = null

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = ORT_WASM_PATH
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
    }).catch((err) => {
      sessionPromise = null
      throw err
    })
  }
  return sessionPromise
}

/** Precarga el modelo (para pagar el costo al abrir el kiosco, no al marcar). */
export function preloadEmbeddingModel(): Promise<unknown> {
  return getSession()
}

/**
 * Calcula el embedding L2-normalizado del recorte facial (canvas cuadrado ya
 * escalado a 112x112 por el llamador).
 */
export async function computeEmbedding(faceCanvas: HTMLCanvasElement): Promise<number[]> {
  const ctx = faceCanvas.getContext('2d')
  if (!ctx) throw new Error('Canvas sin contexto 2d.')

  const { data } = ctx.getImageData(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE)
  const tensorData = rgbaToNchwFloat32(data)

  const session = await getSession()
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]

  const input = new ort.Tensor('float32', tensorData, [1, 3, FACE_INPUT_SIZE, FACE_INPUT_SIZE])
  const outputs = await session.run({ [inputName]: input })
  const raw = outputs[outputName].data as Float32Array

  if (raw.length !== FACE_EMBEDDING_DIM) {
    throw new Error(`El modelo devolvio ${raw.length} dimensiones, esperaba ${FACE_EMBEDDING_DIM}.`)
  }

  return l2Normalize(Array.from(raw))
}
