'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2 } from 'lucide-react'
import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton'
import { encryptFacePayload, type EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import {
  LIVE_THRESHOLD,
  MIN_LIVE_SAMPLES as MIN_SAMPLES,
  type LivenessProof,
} from '@/modules/attendance/lib/face/livenessProof'
import {
  enrollmentMedoid,
  InconsistentEnrollmentError,
} from '@/modules/attendance/lib/face/enrollment'
import { timeFaceStage } from './timing'
import { FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'
import { discardFaceLandmarker, getFaceLandmarker } from './faceLandmarker'
import { analysisStride, createFrameRateMeter } from './frameRate'
import { faceBounds, overlapsPreviousFace, primaryFace, type FaceBounds } from './primaryFace'
import { getHandLandmarker } from './handLandmarker'
import { computeEmbedding, preloadEmbeddingModel } from './embedding'
import { preloadAntispoofModel, scoreRealness } from './antispoof'
import { eyeTiltAngle, faceCropBox, firstFaceLandmarks } from './landmarks'
import { getScanVisual, MESSAGE_HOLD_MS, type ScanPhase, type ScanTone } from './scanVisual'
import {
  assessPixels,
  assessQuality,
  DARK_GLASSES_MESSAGE,
  eyeShade,
  HAND_ON_FACE_MESSAGE,
  looksLikeDarkGlasses,
  handCoversFace,
  ovalInVideo,
  qualityMessage,
} from './quality'

/**
 * Umbrales sobre la MEDIANA del puntaje de realidad. Medidos contra las
 * imagenes de referencia del repo oficial: rostro real 0.999, foto de una foto
 * 0.011. La brecha es enorme, asi que los umbrales se ponen holgados y dejan
 * una zona muerta amplia — en la duda no se confirma NI se acusa, se cae al
 * PIN, que es el resultado seguro.
 */
const SPOOF_THRESHOLD = 0.35

/** Mediciones necesarias antes de dictar un veredicto. */

/**
 * Se evalua 1 de cada N frames: la inferencia toma ~10-25 ms y correrla en
 * todos los frames competiria con el detector de landmarks sin agregar
 * informacion (frames contiguos son casi identicos).
 */
const SCORE_EVERY = 3

/** Tiempo maximo buscando evidencia antes de rendirse y pedir PIN. */
const DECISION_TIMEOUT_MS = 8000

/**
 * Tiempo que se dedica a juntar candidatos de captura una vez confirmada la
 * vida: se conserva el recorte MAS NITIDO del lote en vez de disparar con el
 * primer frame valido. Un descriptor sacado de un frame borroso acerca a
 * personas distintas entre si, que es el peor error posible del kiosco.
 */
const CAPTURE_WINDOW_MS = 500
const RATE_WARMUP_MS = 1500
const CROWDED_HOLD_MS = 1000

/**
 * El brillo de los ojos se mide en una copia pequeña para que la pista
 * de lentes oscuros no compita con el detector de rostro.
 */
const SHADE_EVERY = 2
const SHADE_SIZE = { w: 160, h: 120 }
const DARK_STREAK = 4

const FACE_LIMIT = 2

/** Mensaje cuando hay mas de una persona frente a la camara (registro). */
export const TWO_FACES_MESSAGE = 'Que solo una persona quede frente a la cámara'

/** Capturas que se juntan en el registro, y la pausa minima entre ellas. */
export const ENROLLMENT_CAPTURES = 3
const ENROLLMENT_GAP_MS = 300

/**
 * Empieza a bajar los modelos antes de abrir la camara: el registro lo llama
 * al mostrar la guia, asi el costo se paga mientras se lee. Cada carga es
 * unica (promesa compartida), asi que llamarlo de mas no repite descargas, y
 * un fallo aca no importa: FaceScan lo vuelve a intentar y lo reporta.
 */
export function preloadFaceScan(enrollment = false): void {
  const loads: Promise<unknown>[] = [
    getFaceLandmarker(FACE_LIMIT),
    preloadEmbeddingModel(),
    preloadAntispoofModel(),
  ]
  if (enrollment) loads.push(getHandLandmarker())
  for (const load of loads) load.catch(() => {})
}

const DEBUG = process.env.NEXT_PUBLIC_FACE_DEBUG === 'true'

export interface FaceScanMetrics {
  scanMs: number
  fps: number
}

export interface FaceScanProps {
  enrollment?: boolean
  /**
   * Recibe el embedding YA cifrado, junto con la prueba de vida que lo
   * respalda. El padre decide que hacer (verificar en el kiosco, enrolar desde
   * el tab Rostro del perfil del empleado). Mientras la promesa esta viva,
   * FaceScan muestra "listo".
   */
  onEmbedding: (payload: EncryptedVector, metrics?: FaceScanMetrics) => Promise<void>
  /**
   * Camara denegada/ausente, modelos que no cargan o llave sin configurar:
   * el padre debe caer al flujo alterno (PIN). Nunca se llama mas de una vez.
   */
  onUnavailable: (reason: string) => void
  /**
   * El clasificador determino que lo que ve no es una persona real sino una
   * reproduccion — foto impresa, pantalla de telefono o monitor. Es un rechazo
   * activo, no una falla del sistema, y el padre deberia tratarlo distinto de
   * onUnavailable. Si no se provee, el caso se degrada a onUnavailable.
   */
  onSpoof?: () => void
}

/** Color del ovalo y del anillo por tono. Siempre va junto al texto. */
const TONE_STROKE: Record<ScanTone, string> = {
  neutral: 'stroke-white/70',
  warn: 'stroke-amber-400',
  progress: 'stroke-sky-400',
  done: 'stroke-emerald-400',
}

/** Guia del ovalo debajo del anillo: ambar si hay que corregir algo. */
const GUIDE_STROKE: Record<ScanTone, string> = {
  neutral: 'stroke-white/70',
  warn: 'stroke-amber-400',
  progress: 'stroke-white/25',
  done: 'stroke-white/25',
}

/**
 * Proporcion del ovalo dentro del video 4:3: ocupa 1/2 del ancho y 3/4 del
 * alto, asi que su caja mide (0.5*4)/(0.75*3) = 0.889 de ancho por alto. El
 * viewBox respeta esa proporcion para que el trazo no se deforme.
 */
const OVAL_BOX = { w: 80, h: 90, rx: 37, ry: 42, stroke: 3 }

/**
 * Parte del video que ocupa el ovalo DIBUJADO (la elipse, no su caja): la caja
 * es 1/2 del ancho y 3/4 del alto, y la elipse ocupa 2*rx/w y 2*ry/h de ella.
 * La validacion usa estas medidas para exigir lo mismo que se ve.
 */
const OVAL_WIDTH_SHARE = 0.5 * ((2 * OVAL_BOX.rx) / OVAL_BOX.w)
const OVAL_HEIGHT_SHARE = 0.75 * ((2 * OVAL_BOX.ry) / OVAL_BOX.h)

/** Mismo ovalo como trazado que empieza arriba y gira en sentido horario. */
const RING_PATH = (() => {
  const { w, h, rx, ry } = OVAL_BOX
  const cx = w / 2
  const top = h / 2 - ry
  const bottom = h / 2 + ry
  return `M ${cx} ${top} A ${rx} ${ry} 0 1 1 ${cx} ${bottom} A ${rx} ${ry} 0 1 1 ${cx} ${top}`
})()

/**
 * Texto y tono que se muestran, con un respiro de MESSAGE_HOLD_MS antes de
 * cambiar: la mano y el encuadre se evaluan en cada cuadro, y sin esto la
 * franja (y el lector de pantalla) cambiarian varias veces por segundo. El
 * cierre ("listo") no espera.
 */
function useSettledLabel(tone: ScanTone, message: string) {
  const key = `${tone}|${message}`
  const [shown, setShown] = useState(key)
  useEffect(() => {
    if (key === shown) return
    const timer = setTimeout(() => setShown(key), tone === 'done' ? 0 : MESSAGE_HOLD_MS)
    return () => clearTimeout(timer)
  }, [key, shown, tone])
  const sep = shown.indexOf('|')
  return { tone: shown.slice(0, sep) as ScanTone, message: shown.slice(sep + 1) }
}

interface Candidate {
  canvas: HTMLCanvasElement
  sharpness: number
}

interface DebugInfo {
  ultimo: number | null
  mediana: number | null
  muestras: number
  confirmado: boolean
}

/** Mediana de una lista no vacia (no muta la entrada). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Captura facial. Todo el procesamiento pesado ocurre en el cliente:
 * MediaPipe ubica el rostro, un clasificador anti-spoofing decide si hay una
 * persona real, el recorte pasa por la red de reconocimiento de face-api.js y
 * el vector sale cifrado (AES-256-GCM). La foto jamas abandona este
 * componente.
 *
 * PRUEBA DE VIDA — anti-foto (SGRH-80). La decide MiniFASNetV2 (antispoof.ts)
 * analizando el MATERIAL de lo que ve: grano de impresion, muare de pantalla,
 * reflejo especular, bordes y marco. Se toma la MEDIANA de varias mediciones
 * por frame, no una lectura suelta.
 *
 * Se llego aca despues de descartar, con datos de camara, tres enfoques
 * geometricos sobre los landmarks de MediaPipe: todos fueron burlados con una
 * foto en la pantalla de un telefono, porque esos landmarks son la proyeccion
 * de un modelo 3D canonico que la red ajusta incluso a una imagen plana — ver
 * la nota larga en antispoof.ts. Por eso aqui NO queda ningun chequeo
 * geometrico: mantener una defensa que ya se demostro burlada solo sirve para
 * aparentar proteccion.
 *
 * LENTES: el clasificador juzga material, no comportamiento de los ojos, asi
 * que unos lentes —claros u oscuros— le son indiferentes por construccion.
 *
 * Falla CERRADO: si no logra evidencia suficiente a tiempo, no captura; cae al
 * PIN.
 */
export function FaceScan({
  onEmbedding,
  onUnavailable,
  onSpoof,
  enrollment = false,
}: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const unavailableRef = useRef(false)

  const [status, setStatus] = useState<ScanPhase>('iniciando')
  const [hint, setHint] = useState<string | null>(null)
  const [debug, setDebug] = useState<DebugInfo | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [livenessSamples, setLivenessSamples] = useState(0)
  const [captureProgress, setCaptureProgress] = useState(0)
  const [crowded, setCrowded] = useState(false)

  const visual = getScanVisual({
    phase: status,
    hint,
    crowded: !enrollment && crowded,
    livenessSamples,
    livenessNeeded: MIN_SAMPLES,
    captureProgress,
  })
  const label = useSettledLabel(visual.tone, visual.message)

  useEffect(() => {
    let cancelled = false
    doneRef.current = false
    unavailableRef.current = false
    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    function fail(reason: string) {
      if (unavailableRef.current || cancelled) return
      unavailableRef.current = true
      doneRef.current = true
      stopCamera()
      onUnavailable(reason)
    }

    function rejectSpoof() {
      if (unavailableRef.current || cancelled) return
      unavailableRef.current = true
      doneRef.current = true
      stopCamera()
      if (onSpoof) onSpoof()
      else onUnavailable('No se detectó una persona real frente a la cámara.')
    }

    async function start() {
      const key = process.env.NEXT_PUBLIC_FACE_VECTOR_KEY
      if (!key) {
        fail('El reconocimiento facial no está configurado en este kiosco.')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fail('Este dispositivo no tiene cámara disponible.')
        return
      }

      // La camara se pide EN PARALELO con los modelos (SGRH-117): antes se
      // pedia recien al terminar de cargarlos, y la persona miraba un recuadro
      // negro durante toda la descarga. Asi el video aparece enseguida.
      const cameraPromise = navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      // Los dos modelos pesados se precargan en paralelo con el detector
      // para que el costo se pague al abrir el kiosco y no al marcar. El
      // registro suma el detector de manos.
      const modelsPromise = timeFaceStage('models', () =>
        Promise.all([
          getFaceLandmarker(FACE_LIMIT),
          enrollment ? getHandLandmarker() : Promise.resolve(null),
          preloadEmbeddingModel(),
          preloadAntispoofModel(),
        ])
      )
      // Ninguna de las dos debe quedar como rechazo sin manejar si la otra
      // falla primero.
      modelsPromise.catch(() => {})

      let stream: MediaStream
      try {
        stream = await cameraPromise
      } catch {
        fail('No se pudo acceder a la cámara.')
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stopCamera()
        return
      }
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // El autoplay puede rechazarse si el tab pierde foco: el loop de
        // deteccion simplemente no vera frames hasta que vuelva.
      }

      if (cancelled) return

      let landmarker: Awaited<ReturnType<typeof getFaceLandmarker>>
      let handLandmarker: Awaited<ReturnType<typeof getHandLandmarker>> | null
      try {
        const models = await modelsPromise
        landmarker = models[0]
        handLandmarker = models[1]
      } catch {
        fail('No se pudieron cargar los modelos de reconocimiento.')
        return
      }

      if (cancelled) return
      // El skeleton se quita recien con camara Y modelos listos (y calentados,
      // ver warmUp.ts). Antes se mostraba el video apenas respondia la camara,
      // y la compilacion de los modelos lo dejaba congelado frente a la persona.
      setCameraReady(true)

      setStatus('buscando_rostro')

      const scores: number[] = []
      let proof: LivenessProof | null = null
      let frameCount = 0
      let scoring = false
      let startMs: number | null = null
      let captureStartMs: number | null = null
      let best: Candidate | null = null
      let lastVideoTime = -1
      let generation = 0
      let candidates: Candidate[] = []
      let lastCandidateMs = -Infinity
      let detectionFrames = 0
      let detectionMs = 0
      // Ultima indicacion que se le dio a la persona: si se vence el plazo, el
      // mensaje dice la causa probable en vez de un "intenta de nuevo" vacio.
      let lastHint: string | null = null
      // Mediciones seguidas con los ojos oscuros (ver lentes oscuros abajo).
      let darkStreak = 0
      let shadeTick = 0
      let shadeCanvas: HTMLCanvasElement | null = null
      const frameRate = createFrameRateMeter()
      let firstVideoFrameAt: number | null = null
      let videoFrames = 0
      let lastAnalyzedFrame = 0
      let lastScoreFrame = 0
      let scanStartedAt: number | null = null
      let scanFrames = 0
      let previousPrimary: FaceBounds | null = null
      let hadMultipleFaces = false
      let crowdedSince: number | null = null

      /** Brillo de ojos vs piel sobre una copia chica del cuadro actual. */
      function sampleEyeShade(v: HTMLVideoElement, landmarks: { x: number; y: number }[]) {
        if (!shadeCanvas) {
          shadeCanvas = document.createElement('canvas')
          shadeCanvas.width = SHADE_SIZE.w
          shadeCanvas.height = SHADE_SIZE.h
        }
        const ctx = shadeCanvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return null
        try {
          ctx.drawImage(v, 0, 0, SHADE_SIZE.w, SHADE_SIZE.h)
          return eyeShade(ctx.getImageData(0, 0, SHADE_SIZE.w, SHADE_SIZE.h), landmarks)
        } catch {
          return null
        }
      }

      function showHint(next: string | null) {
        if (next) lastHint = next
        setHint(next)
      }

      function timeoutMessage(fallback: string) {
        if (!enrollment && darkStreak >= DARK_STREAK) {
          return 'No pudimos completar la captura. Si usas lentes de sol, quítatelos e intenta de nuevo.'
        }
        return lastHint
          ? `No pudimos completar la captura. ${lastHint} e intenta de nuevo.`
          : fallback
      }

      function resetCapture(resetTimer = false) {
        if (resetTimer) {
          startMs = null
          if (!enrollment) {
            scanStartedAt = null
            scanFrames = 0
            previousPrimary = null
            hadMultipleFaces = false
            crowdedSince = null
            darkStreak = 0
            setCrowded(false)
          }
        }
        generation += 1
        scores.length = 0
        proof = null
        frameCount = 0
        lastScoreFrame = videoFrames
        captureStartMs = null
        best = null
        candidates = []
        lastCandidateMs = -Infinity
        setLivenessSamples(0)
        setCaptureProgress(0)
      }

      /** Recorte alineado del rostro, listo para el modelo de embeddings. */
      function buildCrop(
        v: HTMLVideoElement,
        landmarks: { x: number; y: number }[]
      ): HTMLCanvasElement | null {
        const box = faceCropBox(landmarks, v.videoWidth, v.videoHeight)
        const angle = eyeTiltAngle(landmarks, v.videoWidth, v.videoHeight)
        if (!box || angle === null) return null

        const canvas = document.createElement('canvas')
        canvas.width = FACE_INPUT_SIZE
        canvas.height = FACE_INPUT_SIZE
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return null

        // Nivelar los ojos antes de recortar: face-api.js espera un chip
        // alineado (igual que dlib), no un bounding-box crudo — ver
        // eyeTiltAngle en landmarks.ts.
        const centerX = box.x + box.size / 2
        const centerY = box.y + box.size / 2
        ctx.save()
        ctx.translate(FACE_INPUT_SIZE / 2, FACE_INPUT_SIZE / 2)
        ctx.rotate(-angle)
        ctx.drawImage(
          v,
          centerX - box.size / 2,
          centerY - box.size / 2,
          box.size,
          box.size,
          -FACE_INPUT_SIZE / 2,
          -FACE_INPUT_SIZE / 2,
          FACE_INPUT_SIZE,
          FACE_INPUT_SIZE
        )
        ctx.restore()
        return canvas
      }

      function capture(canvas: HTMLCanvasElement, livenessProof: LivenessProof) {
        if (DEBUG)
          console.info('[kiosk timing]', 'capture', {
            frames: detectionFrames,
            averageDetectionMs: detectionFrames ? Math.round(detectionMs / detectionFrames) : 0,
            elapsedMs: startMs === null ? 0 : Math.round(performance.now() - startMs),
          })
        doneRef.current = true
        stopCamera()
        setStatus('listo')
        setHint(null)

        void (async () => {
          try {
            const vector = await timeFaceStage('embedding', async () => {
              if (!enrollment) return computeEmbedding(canvas)
              const vectors: number[][] = []
              for (const candidate of candidates)
                vectors.push(await computeEmbedding(candidate.canvas))
              return enrollmentMedoid(vectors)
            })
            if (cancelled) return
            const elapsedMs = scanStartedAt === null ? 0 : performance.now() - scanStartedAt
            const metrics =
              !enrollment && elapsedMs > 0
                ? {
                    scanMs: Math.min(120_000, Math.round(elapsedMs)),
                    fps: Math.min(240, Math.round((scanFrames * 10_000) / elapsedMs) / 10),
                  }
                : undefined
            const payload = await timeFaceStage('encrypt', () =>
              encryptFacePayload<LivenessProof>({ vector, liveness: livenessProof }, key!)
            )
            if (cancelled) return
            if (enrollment) await onEmbedding(payload)
            else await onEmbedding(payload, metrics)
          } catch (err) {
            // Tomas que no coinciden entre si: decirle a la persona que
            // corregir, no un "no se pudo" generico.
            fail(
              err instanceof InconsistentEnrollmentError
                ? err.message
                : 'No se pudo procesar el rostro capturado.'
            )
          }
        })()
      }

      const loop = () => {
        if (cancelled || doneRef.current) return
        const v = videoRef.current
        const now = performance.now()
        const videoReady = v && v.readyState >= 2
        if (
          (!enrollment || videoReady) &&
          startMs !== null &&
          now - startMs > DECISION_TIMEOUT_MS
        ) {
          fail(
            timeoutMessage(
              'No pudimos completar una captura válida. Ajusta la luz e intenta de nuevo.'
            )
          )
          return
        }
        if (!videoReady) {
          rafRef.current = requestAnimationFrame(loop)
          return
        }
        if (document.hidden || v.currentTime === lastVideoTime) {
          if (document.hidden) resetCapture(true)
          rafRef.current = requestAnimationFrame(loop)
          return
        }
        lastVideoTime = v.currentTime

        if (!enrollment) {
          firstVideoFrameAt ??= now
          videoFrames += 1
          // Medir antes de saltar evita que el salto reduzca su propia estimación.
          const fps = frameRate.record(now)
          const stride = now - firstVideoFrameAt >= RATE_WARMUP_MS ? analysisStride(fps) : 1
          if (videoFrames - lastAnalyzedFrame < stride) {
            rafRef.current = requestAnimationFrame(loop)
            return
          }
          lastAnalyzedFrame = videoFrames
        }

        let result: ReturnType<typeof landmarker.detectForVideo>
        try {
          result = landmarker.detectForVideo(v, now)
          detectionFrames += 1
          detectionMs += performance.now() - now
        } catch {
          const reportFailure = () => fail('No se pudo analizar la cámara. Intenta de nuevo.')
          if (enrollment) reportFailure()
          else void discardFaceLandmarker(FACE_LIMIT).then(reportFailure)
          return
        }
        const selection = enrollment
          ? { landmarks: firstFaceLandmarks(result), crowded: false }
          : primaryFace(result?.faceLandmarks ?? [], v.videoWidth, v.videoHeight)
        const { landmarks } = selection

        // Registro: una sola persona en cuadro. Con dos, no hay forma de saber
        // de quien es el rostro que se guarda (SGRH-117).
        if (enrollment && landmarks && (result.faceLandmarks?.length ?? 0) > 1) {
          resetCapture(true)
          setStatus('ajusta_encuadre')
          showHint(TWO_FACES_MESSAGE)
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        if (!landmarks) {
          resetCapture(true)
          setStatus('buscando_rostro')
          setHint(null)
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        if (startMs === null) startMs = now
        if (!enrollment) {
          if (scanStartedAt !== null) scanFrames += 1
          const multipleFaces = (result.faceLandmarks?.length ?? 0) > 1
          const bounds = faceBounds(landmarks)
          if (
            (multipleFaces || hadMultipleFaces) &&
            previousPrimary &&
            !overlapsPreviousFace(previousPrimary, bounds)
          ) {
            // La evidencia de una cara no respalda la captura de otra.
            resetCapture()
            crowdedSince = null
            darkStreak = 0
          }
          previousPrimary = bounds
          hadMultipleFaces = multipleFaces
          crowdedSince = selection.crowded ? (crowdedSince ?? now) : null
          setCrowded(selection.crowded)
        }
        const quality = assessQuality(landmarks, {
          oval: ovalInVideo(
            v.videoWidth,
            v.videoHeight,
            4 / 3,
            OVAL_WIDTH_SHARE,
            OVAL_HEIGHT_SHARE
          ),
        })
        if (!quality || !quality.ok) {
          resetCapture()
          setStatus('ajusta_encuadre')
          showHint(quality ? qualityMessage(quality.issues) : null)
          rafRef.current = requestAnimationFrame(loop)
          return
        }
        if (!enrollment && scanStartedAt === null) {
          scanStartedAt = now
          scanFrames = 1
        }

        // Registro: una mano sobre la cara invalida TODO lo juntado hasta ahi
        // y reinicia el plazo, para que la persona tenga tiempo de quitarla.
        // Se revisa en cada frame: basta un frame con la mano encima para que
        // ninguna de las tres capturas pueda salir tapada.
        if (handLandmarker) {
          let covered = false
          try {
            const hands = handLandmarker.detectForVideo(v, now).landmarks ?? []
            covered = hands.length > 0 && handCoversFace(landmarks, hands)
          } catch {
            fail('No se pudo analizar la cámara. Intenta de nuevo.')
            return
          }
          if (covered) {
            resetCapture(true)
            setStatus('ajusta_encuadre')
            showHint(HAND_ON_FACE_MESSAGE)
            rafRef.current = requestAnimationFrame(loop)
            return
          }
        }

        // Se exige una racha para que un parpadeo no se confunda con lentes.
        // El kiosco guarda esa pista para el mensaje de tiempo agotado.
        shadeTick += 1
        if (shadeTick % SHADE_EVERY === 0) {
          const shade = sampleEyeShade(v, landmarks)
          darkStreak = looksLikeDarkGlasses(shade) ? darkStreak + 1 : 0
          if (enrollment && DEBUG && shade)
            console.info('[face] ojos/piel', shade.right.toFixed(2), shade.left.toFixed(2))
        }
        if (enrollment && darkStreak >= DARK_STREAK) {
          resetCapture(true)
          setStatus('ajusta_encuadre')
          showHint(DARK_GLASSES_MESSAGE)
          rafRef.current = requestAnimationFrame(loop)
          return
        }
        setHint(null)

        // ---- Fase 1: decidir si hay una persona real ----
        if (!proof) {
          setStatus('evaluando')
          frameCount += 1

          // La inferencia es asincrona: se lanza sin bloquear el loop y se
          // ignoran los frames que lleguen mientras una sigue en vuelo.
          // El salto de cuadros no debe multiplicar la espera entre muestras.
          const sampleDue = enrollment
            ? frameCount % SCORE_EVERY === 0
            : videoFrames - lastScoreFrame >= SCORE_EVERY
          if (!scoring && sampleDue) {
            scoring = true
            lastScoreFrame = videoFrames
            const sampleGeneration = generation
            void scoreRealness(v, landmarks, v.videoWidth, v.videoHeight)
              .then((score) => {
                if (
                  !cancelled &&
                  !doneRef.current &&
                  sampleGeneration === generation &&
                  score !== null
                ) {
                  scores.push(score)
                  setLivenessSamples(scores.length)
                }
              })
              .catch(() => {
                // Un fallo suelto de inferencia no debe tumbar la sesion; si
                // fallan todas, el timeout se encarga.
              })
              .finally(() => {
                scoring = false
              })
          }

          if (DEBUG) {
            setDebug({
              ultimo: scores.length > 0 ? scores[scores.length - 1] : null,
              mediana: scores.length > 0 ? median(scores) : null,
              muestras: scores.length,
              confirmado: false,
            })
          }

          if (scores.length >= MIN_SAMPLES) {
            const score = median(scores)

            if (score >= LIVE_THRESHOLD) {
              proof = { method: 'textura', score, samples: scores.length }
            } else if (score <= SPOOF_THRESHOLD) {
              rejectSpoof()
              return
            }
            // Zona muerta: seguir midiendo hasta el timeout.
          }

          if (!proof) {
            if (now - startMs > DECISION_TIMEOUT_MS) {
              fail(timeoutMessage('No pudimos confirmar que haya una persona frente a la cámara.'))
              return
            }
            rafRef.current = requestAnimationFrame(loop)
            return
          }

          if (DEBUG) {
            setDebug({
              ultimo: scores[scores.length - 1] ?? null,
              mediana: proof.score,
              muestras: proof.samples,
              confirmado: true,
            })
          }
        }

        // ---- Fase 2: capturar el mejor encuadre ----
        setStatus('capturando')
        const canvas = buildCrop(v, landmarks)
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          // La nitidez se mide sobre el RECORTE y no sobre el frame completo:
          // lo que importa es que este definida la cara, no el fondo.
          const image = ctx?.getImageData(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE)
          const pixels = image ? assessPixels(image) : null
          const sharpness = pixels?.sharpness ?? 0

          // Reject empty/flat captures without inventing device-specific blur thresholds.
          if (!pixels?.ok) {
            showHint('Mejora la luz y mantén el rostro quieto')
            rafRef.current = requestAnimationFrame(loop)
            return
          }
          if (
            enrollment &&
            now - lastCandidateMs >= ENROLLMENT_GAP_MS &&
            candidates.length < ENROLLMENT_CAPTURES
          ) {
            candidates.push({ canvas, sharpness })
            lastCandidateMs = now
          }

          if (!best || sharpness > best.sharpness) best = { canvas, sharpness }
          if (captureStartMs === null) captureStartMs = now
          setCaptureProgress(
            enrollment
              ? candidates.length / ENROLLMENT_CAPTURES
              : Math.min(1, (now - captureStartMs) / CAPTURE_WINDOW_MS)
          )
        }

        // Se dispara con el mejor candidato del lote, no con el primero.
        if (
          best &&
          captureStartMs !== null &&
          now - captureStartMs >= CAPTURE_WINDOW_MS &&
          (crowdedSince === null || now - crowdedSince >= CROWDED_HOLD_MS) &&
          (!enrollment || candidates.length === ENROLLMENT_CAPTURES)
        ) {
          capture(best.canvas, proof)
          return
        }

        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    void start()

    return () => {
      cancelled = true
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [onEmbedding, onUnavailable, onSpoof, enrollment])

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* El alto se limita al del viewport: en un telefono acostado (375px de
          alto) el video 4:3 a todo el ancho dejaba los botones fuera de
          pantalla. */}
      <div
        className={`relative mx-auto w-full max-w-[calc(60dvh*4/3)] overflow-hidden rounded-3xl ring-1 ring-blue-100 ${cameraReady ? 'bg-slate-900' : 'bg-white'}`}
      >
        {/* El video se espeja como un espejo real: menos desconcertante. */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />

        {/* Hasta que llega la imagen: la silueta de carga del resto del
            sistema (Skeleton) en vez de un recuadro negro. El video sigue
            montado debajo porque el stream se le asigna por ref. */}
        {!cameraReady && (
          <SkeletonRegion label="Preparando la cámara…" className="absolute inset-0 space-y-0">
            <Skeleton className="h-full w-full" rounded="rounded-3xl" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Camera className="h-8 w-8" aria-hidden="true" />
              <span className="text-sm font-medium" aria-hidden="true">
                Preparando la cámara…
              </span>
            </div>
          </SkeletonRegion>
        )}

        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center ${cameraReady ? '' : 'hidden'}`}
        >
          <svg
            viewBox={`0 0 ${OVAL_BOX.w} ${OVAL_BOX.h}`}
            className="h-3/4 w-1/2 overflow-visible"
            aria-hidden="true"
            data-testid="scan-ring"
            data-tone={visual.tone}
            data-progress={visual.progress.toFixed(2)}
          >
            {/* Guia del ovalo: punteada mientras busca, ambar cuando hay que
                corregir algo y tenue debajo del anillo mientras avanza. */}
            <ellipse
              cx={OVAL_BOX.w / 2}
              cy={OVAL_BOX.h / 2}
              rx={OVAL_BOX.rx}
              ry={OVAL_BOX.ry}
              fill="none"
              strokeWidth={visual.tone === 'neutral' ? 1 : OVAL_BOX.stroke}
              strokeDasharray={visual.tone === 'neutral' ? '3 3' : undefined}
              className={`transition-[stroke] duration-300 motion-reduce:transition-none ${GUIDE_STROKE[visual.tone]}`}
            />
            {/* Anillo de avance: arranca arriba y avanza en sentido horario. Es
                un trazado y no una <ellipse> rotada: rotar una elipse que no es
                circulo la acuesta. Al vaciarse lo hace con una transicion
                corta, nunca de golpe. */}
            <path
              d={RING_PATH}
              fill="none"
              strokeWidth={OVAL_BOX.stroke}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - visual.progress}
              className={`transition-[stroke-dashoffset,stroke,opacity] duration-300 ease-out motion-reduce:transition-none ${TONE_STROKE[visual.tone]} ${visual.progress > 0 ? 'opacity-100' : 'opacity-0'}`}
            />
          </svg>
        </div>

        {visual.tone === 'done' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <CheckCircle2
              className="h-20 w-20 text-emerald-400 drop-shadow-lg motion-safe:animate-[pulse_1s_ease-out_1]"
              aria-hidden="true"
            />
          </div>
        )}

        {/* Franja de indicaciones SOBRE el video, fuera del espejo: se lee a
            un metro y no queda al reves. */}
        {cameraReady && (
          <p
            className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center text-base font-semibold text-white text-balance sm:text-lg"
            aria-live="polite"
          >
            {label.message}
          </p>
        )}

        {DEBUG && debug && (
          <div className="pointer-events-none absolute left-0 top-0 m-2 rounded-lg bg-black/80 p-2.5 font-mono text-[11px] leading-relaxed text-lime-300">
            <div className="mb-1 border-b border-lime-300/30 pb-1 font-bold text-lime-200">
              ANTI-SPOOF — mediana decide
            </div>
            <div>
              MEDIANA{' '}
              <span
                className={
                  debug.mediana === null
                    ? 'text-slate-400'
                    : debug.mediana >= LIVE_THRESHOLD
                      ? 'font-bold text-emerald-400'
                      : debug.mediana <= SPOOF_THRESHOLD
                        ? 'font-bold text-red-400'
                        : 'text-amber-300'
                }
              >
                {debug.mediana?.toFixed(4) ?? '—'}
              </span>{' '}
              (n={debug.muestras}/{MIN_SAMPLES})
            </div>
            <div className="text-slate-400">ultimo {debug.ultimo?.toFixed(4) ?? '—'}</div>
            <div className="mt-1 border-t border-lime-300/30 pt-1 text-slate-400">
              real ≥{LIVE_THRESHOLD} · foto ≤{SPOOF_THRESHOLD}
            </div>
            {debug.confirmado && (
              <div className="font-bold text-emerald-400">CONFIRMADO — persona real</div>
            )}
          </div>
        )}
      </div>
      {!enrollment && (
        <p className="text-center text-xs text-slate-500">De frente, sin nada en la cara</p>
      )}
    </div>
  )
}
