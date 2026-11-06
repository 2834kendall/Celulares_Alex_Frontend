'use client'

import { useEffect, useRef, useState } from 'react'
import { ScanFace } from 'lucide-react'
import { encryptFacePayload, type EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import {
  LIVE_THRESHOLD,
  MIN_LIVE_SAMPLES as MIN_SAMPLES,
  type LivenessProof,
} from '@/modules/attendance/lib/face/livenessProof'
import { enrollmentMedoid } from '@/modules/attendance/lib/face/enrollment'
import { timeFaceStage } from './timing'
import { FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'
import { getFaceLandmarker } from './faceLandmarker'
import { computeEmbedding, preloadEmbeddingModel } from './embedding'
import { preloadAntispoofModel, scoreRealness } from './antispoof'
import { eyeTiltAngle, faceCropBox, firstFaceLandmarks } from './landmarks'
import { assessPixels, assessQuality, qualityMessage } from './quality'

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

const DEBUG = process.env.NEXT_PUBLIC_FACE_DEBUG === 'true'

export interface FaceScanProps {
  enrollment?: boolean
  /**
   * Recibe el embedding YA cifrado, junto con la prueba de vida que lo
   * respalda. El padre decide que hacer (verificar en el kiosco, enrolar desde
   * el tab Rostro del perfil del empleado). Mientras la promesa esta viva,
   * FaceScan muestra "procesando".
   */
  onEmbedding: (payload: EncryptedVector) => Promise<void>
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

type ScanStatus = 'iniciando' | 'buscando_rostro' | 'ajusta_encuadre' | 'evaluando' | 'procesando'

const STATUS_TEXT: Record<ScanStatus, string> = {
  iniciando: 'Preparando la camara…',
  buscando_rostro: 'Coloca tu rostro frente a la camara',
  ajusta_encuadre: 'Acomoda tu rostro en el recuadro',
  evaluando: 'Verificando…',
  procesando: 'Procesando…',
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

  const [status, setStatus] = useState<ScanStatus>('iniciando')
  const [hint, setHint] = useState<string | null>(null)
  const [debug, setDebug] = useState<DebugInfo | null>(null)

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
      else onUnavailable('No se detecto una persona real frente a la camara.')
    }

    async function start() {
      const key = process.env.NEXT_PUBLIC_FACE_VECTOR_KEY
      if (!key) {
        fail('El reconocimiento facial no esta configurado en este kiosco.')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fail('Este dispositivo no tiene camara disponible.')
        return
      }

      let landmarker: Awaited<ReturnType<typeof getFaceLandmarker>>
      try {
        // Los dos modelos pesados se precargan en paralelo con el detector
        // para que el costo se pague al abrir el kiosco y no al marcar.
        const models = await timeFaceStage('models', () =>
          Promise.all([getFaceLandmarker(), preloadEmbeddingModel(), preloadAntispoofModel()])
        )
        landmarker = models[0]
      } catch {
        fail('No se pudieron cargar los modelos de reconocimiento.')
        return
      }

      if (cancelled) return

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
      } catch {
        fail('No se pudo acceder a la camara.')
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

      function resetCapture(resetTimer = false) {
        if (resetTimer) startMs = null
        generation += 1
        scores.length = 0
        proof = null
        frameCount = 0
        captureStartMs = null
        best = null
        candidates = []
        lastCandidateMs = -Infinity
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
        setStatus('procesando')
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
            const payload = await timeFaceStage('encrypt', () =>
              encryptFacePayload<LivenessProof>({ vector, liveness: livenessProof }, key!)
            )
            if (cancelled) return
            await onEmbedding(payload)
          } catch {
            fail('No se pudo procesar el rostro capturado.')
          }
        })()
      }

      const loop = () => {
        if (cancelled || doneRef.current) return
        const v = videoRef.current
        if (!v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        const now = performance.now()
        if (startMs !== null && now - startMs > DECISION_TIMEOUT_MS) {
          fail('No pudimos completar una captura valida. Ajusta la luz e intenta de nuevo.')
          return
        }
        if (document.hidden || v.currentTime === lastVideoTime) {
          if (document.hidden) resetCapture(true)
          rafRef.current = requestAnimationFrame(loop)
          return
        }
        lastVideoTime = v.currentTime

        let result: ReturnType<typeof landmarker.detectForVideo>
        try {
          result = landmarker.detectForVideo(v, now)
          detectionFrames += 1
          detectionMs += performance.now() - now
        } catch {
          fail('No se pudo analizar la camara. Intenta de nuevo.')
          return
        }
        const landmarks = firstFaceLandmarks(result)

        if (!landmarks) {
          resetCapture(true)
          setStatus('buscando_rostro')
          setHint(null)
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        if (startMs === null) startMs = now
        const quality = assessQuality(landmarks)
        if (!quality || !quality.ok) {
          resetCapture()
          setStatus('ajusta_encuadre')
          setHint(quality ? qualityMessage(quality.issues) : null)
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
          if (!scoring && frameCount % SCORE_EVERY === 0) {
            scoring = true
            const sampleGeneration = generation
            void scoreRealness(v, landmarks, v.videoWidth, v.videoHeight)
              .then((score) => {
                if (
                  !cancelled &&
                  !doneRef.current &&
                  sampleGeneration === generation &&
                  score !== null
                )
                  scores.push(score)
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
              fail('No pudimos confirmar que haya una persona frente a la camara.')
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
            setHint('Mejora la luz y manten el rostro quieto')
            rafRef.current = requestAnimationFrame(loop)
            return
          }
          if (enrollment && now - lastCandidateMs >= 150 && candidates.length < 3) {
            candidates.push({ canvas, sharpness })
            lastCandidateMs = now
          }

          if (!best || sharpness > best.sharpness) best = { canvas, sharpness }
          if (captureStartMs === null) captureStartMs = now
        }

        // Se dispara con el mejor candidato del lote, no con el primero.
        if (
          best &&
          captureStartMs !== null &&
          now - captureStartMs >= CAPTURE_WINDOW_MS &&
          (!enrollment || candidates.length === 3)
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
      <div className="relative mx-auto w-full max-w-[calc(60dvh*4/3)] overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-blue-100">
        {/* El video se espeja como un espejo real: menos desconcertante. */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-3/4 w-1/2 rounded-[50%] border-2 border-dashed border-white/60" />
        </div>

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
      <p className="flex items-center gap-2 text-center text-sm text-slate-600" aria-live="polite">
        <ScanFace className="h-4 w-4 shrink-0 text-blue-600" />
        {hint ?? STATUS_TEXT[status]}
      </p>
    </div>
  )
}
