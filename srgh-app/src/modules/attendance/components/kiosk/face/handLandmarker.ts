import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { blankCanvas, warmUp } from './warmUp'

/**
 * Carga perezosa y unica del Hand Landmarker de MediaPipe (SGRH-117). Solo lo
 * usa el REGISTRO del rostro: detecta una mano sobre la cara, que el Face
 * Landmarker no ve (ajusta los puntos del rostro igual) y la prueba de vida
 * tampoco (una mano es piel real). Sin esto, una captura con la cara tapada
 * quedaba guardada como el rostro de la persona.
 *
 * Mismo runtime WASM que faceLandmarker.ts; el modelo se sirve desde /public y
 * scripts/setup-face-assets.mjs lo verifica por SHA-256.
 */

const WASM_PATH = '/models/mediapipe-wasm'
const MODEL_PATH = '/models/hand_landmarker.task'

let handPromise: Promise<HandLandmarker> | null = null

export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handPromise) {
    handPromise = (async () => {
      // Import dinamico por la misma razon que en faceLandmarker.ts: MediaPipe
      // toca APIs del navegador al evaluarse y rompe el SSR.
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
      const create = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      let detector: HandLandmarker
      try {
        detector = await create('GPU')
      } catch {
        detector = await create('CPU')
      }
      // Ver warmUp.ts: el primer detectForVideo compila y bloquea segundos.
      await warmUp(() => detector.detectForVideo(blankCanvas(), 1))
      return detector
    })().catch((err) => {
      handPromise = null
      throw err
    })
  }
  return handPromise
}
