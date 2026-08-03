import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

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

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
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
