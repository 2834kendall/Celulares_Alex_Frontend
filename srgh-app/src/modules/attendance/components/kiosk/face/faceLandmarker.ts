import type { FaceLandmarker } from '@mediapipe/tasks-vision'

/**
 * Carga perezosa y unica del Face Landmarker de MediaPipe. Los assets se
 * sirven desde /public (copiados por scripts/setup-face-assets.mjs): el
 * kiosco no depende de ningun CDN en runtime — si la tablet pierde internet
 * despues del primer load, el modelo ya esta en cache del navegador.
 *
 * runningMode VIDEO + blendshapes: los scores eyeBlinkLeft/eyeBlinkRight
 * alimentan la prueba de vida (liveness.ts).
 */

const WASM_PATH = '/models/mediapipe-wasm'
const MODEL_PATH = '/models/face_landmarker.task'

let landmarkerPromise: Promise<FaceLandmarker> | null = null
let infoLogsSilenced = false

/**
 * El runtime WASM de MediaPipe manda TODA su salida por console.error, incluido
 * lo meramente informativo ("INFO: Created TensorFlow Lite XNNPACK delegate for
 * CPU", que es el log normal de arranque del motor). El overlay de desarrollo
 * de Next.js convierte cualquier console.error en un dialogo a pantalla
 * completa, asi que ese aviso benigno interrumpia el kiosco en cada carga y se
 * leia como una falla del reconocimiento facial.
 *
 * Se descartan SOLO las lineas que empiezan con "INFO:". Cualquier otra cosa
 * —errores reales de MediaPipe incluidos— sigue llegando a la consola intacta.
 */
function silenceMediapipeInfoLogs() {
  if (infoLogsSilenced || typeof window === 'undefined') return
  infoLogsSilenced = true

  const original = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('INFO:')) return
    original(...args)
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    silenceMediapipeInfoLogs()
    landmarkerPromise = (async () => {
      // MediaPipe entra por import dinamico, no estatico: al evaluarse toca
      // APIs que solo existen en el navegador, y el arbol del kiosco tambien
      // se evalua en el servidor al renderizar. Con el import arriba, /kiosco
      // reventaba en el SSR antes de montar nada.
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
    })().catch((err) => {
      // Si fallo la carga (assets ausentes, WebGL bloqueado), el siguiente
      // intento debe poder reintentar en vez de heredar la promesa rota.
      landmarkerPromise = null
      throw err
    })
  }
  return landmarkerPromise
}
