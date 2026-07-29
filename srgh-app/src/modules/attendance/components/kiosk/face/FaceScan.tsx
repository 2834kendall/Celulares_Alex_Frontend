'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, RefreshCcw, ScanFace } from 'lucide-react'
import { encryptVector, type EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import { FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'
import { getFaceLandmarker } from './faceLandmarker'
import { computeEmbedding, preloadEmbeddingModel } from './embedding'
import { createLivenessTracker, type LivenessTracker } from './liveness'
import { createMotionLivenessTracker, type MotionLivenessTracker } from './motionLiveness'
import { extractBlinkScores, faceCropBox, firstFaceLandmarks } from './landmarks'

export interface FaceScanProps {
  /**
   * Recibe el embedding YA cifrado. El padre decide que hacer (verificar en
   * el kiosco, enrolar en /kiosco/enrolar). Mientras la promesa esta viva,
   * FaceScan muestra "procesando".
   */
  onEmbedding: (payload: EncryptedVector) => Promise<void>
  /**
   * Camara denegada/ausente, modelos que no cargan o llave sin configurar:
   * el padre debe caer al flujo alterno (PIN). Nunca se llama mas de una vez.
   */
  onUnavailable: (reason: string) => void
}

type ScanStatus =
  'iniciando' | 'buscando_rostro' | 'verificando' | 'esperando_parpadeo' | 'procesando'

const STATUS_TEXT: Record<ScanStatus, string> = {
  iniciando: 'Preparando la camara…',
  buscando_rostro: 'Coloca tu rostro frente a la camara',
  verificando: 'Mantén la mirada en la camara…',
  esperando_parpadeo: 'Parpadea para continuar',
  procesando: 'Verificando…',
}

/**
 * Captura facial con prueba de vida. Todo el procesamiento pesado ocurre en
 * el cliente: MediaPipe ubica el rostro y da los landmarks/blendshapes, el
 * recorte pasa por MobileFaceNet (ONNX Runtime Web) y el vector sale cifrado
 * (AES-256-GCM). La foto jamas abandona este componente.
 *
 * Prueba de vida en dos etapas: PRIMERO micro-movimiento pasivo
 * (motionLiveness.ts) — no le pide nada a la persona, solo mira que la cara
 * se deforme de forma no-rigida entre frames (una foto sostenida con la mano
 * se mueve como un bloque rigido). Si eso no logra confianza a tiempo, cae a
 * pedir un parpadeo explicito (liveness.ts) — mas lento para el usuario, pero
 * imposible de falsificar con una foto impresa. El respaldo solo se activa si
 * el chequeo pasivo no alcanza, nunca al reves.
 */
export function FaceScan({ onEmbedding, onUnavailable }: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const motionTrackerRef = useRef<MotionLivenessTracker>(createMotionLivenessTracker())
  const trackerRef = useRef<LivenessTracker>(createLivenessTracker())
  const phaseRef = useRef<'movimiento' | 'parpadeo'>('movimiento')
  const doneRef = useRef(false)
  const unavailableRef = useRef(false)

  const [status, setStatus] = useState<ScanStatus>('iniciando')
  const [livenessFailed, setLivenessFailed] = useState(false)
  // Cambiar la key reinicia el efecto completo (camara + tracker): es el
  // boton de reintentar despues de un fallo de parpadeo.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    doneRef.current = false
    motionTrackerRef.current = createMotionLivenessTracker()
    trackerRef.current = createLivenessTracker()
    phaseRef.current = 'movimiento'

    function fail(reason: string) {
      if (unavailableRef.current || cancelled) return
      unavailableRef.current = true
      onUnavailable(reason)
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
        // El modelo de embeddings se precarga en paralelo para que el costo
        // se pague aqui y no en el momento de la captura.
        const preload = preloadEmbeddingModel()
        landmarker = await getFaceLandmarker()
        await preload
      } catch {
        fail('No se pudieron cargar los modelos de reconocimiento.')
        return
      }

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
      if (!video) return
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // El autoplay puede rechazarse si el tab pierde foco: el loop de
        // deteccion simplemente no vera frames hasta que vuelva.
      }

      setStatus('buscando_rostro')

      const loop = () => {
        if (cancelled || doneRef.current) return
        const v = videoRef.current
        if (!v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        const result = landmarker.detectForVideo(v, performance.now())
        const landmarks = firstFaceLandmarks(result)
        const blink = extractBlinkScores(result)

        if (!landmarks || !blink) {
          setStatus('buscando_rostro')
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        const now = performance.now()
        let isAlive = false

        if (phaseRef.current === 'movimiento') {
          const motionStatus = motionTrackerRef.current.push({ landmarks, timestampMs: now })

          if (motionStatus === 'vivo') {
            isAlive = true
          } else if (motionStatus === 'requiere_parpadeo') {
            // El chequeo pasivo no logro confianza a tiempo: cae al parpadeo
            // explicito, mas lento pero imposible de falsificar con una foto.
            phaseRef.current = 'parpadeo'
          } else {
            setStatus('verificando')
            rafRef.current = requestAnimationFrame(loop)
            return
          }
        }

        if (!isAlive && phaseRef.current === 'parpadeo') {
          const liveness = trackerRef.current.push({
            blinkLeft: blink.blinkLeft,
            blinkRight: blink.blinkRight,
            timestampMs: now,
          })

          if (liveness === 'sin_parpadeo') {
            // Regla de los lentes oscuros: sin ojos visibles no hay prueba de
            // vida — se falla a proposito y se pide descubrirse el rostro.
            doneRef.current = true
            setLivenessFailed(true)
            return
          }

          if (liveness !== 'vivo') {
            setStatus('esperando_parpadeo')
            rafRef.current = requestAnimationFrame(loop)
            return
          }

          isAlive = true
        }

        if (!isAlive) {
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        // Persona viva: recortar el rostro y generar el embedding.
        doneRef.current = true
        setStatus('procesando')

        const box = faceCropBox(landmarks, v.videoWidth, v.videoHeight)
        if (!box) {
          fail('No se pudo aislar el rostro.')
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = FACE_INPUT_SIZE
        canvas.height = FACE_INPUT_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fail('No se pudo procesar la imagen.')
          return
        }
        ctx.drawImage(v, box.x, box.y, box.size, box.size, 0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE)

        void (async () => {
          try {
            const vector = await computeEmbedding(canvas)
            const payload = await encryptVector(vector, key)
            await onEmbedding(payload)
          } catch {
            fail('No se pudo procesar el rostro capturado.')
          }
        })()
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
    // attempt: reiniciar el escaneo es exactamente re-ejecutar este efecto.
  }, [attempt, onEmbedding, onUnavailable])

  if (livenessFailed) {
    return (
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <Eye className="h-12 w-12 text-amber-300" />
        <p className="text-sm text-amber-300">
          No pudimos ver tus ojos. Si usas lentes oscuros o algo cubre tu rostro, descubrelo e
          intenta de nuevo.
        </p>
        <button
          type="button"
          onClick={() => {
            setLivenessFailed(false)
            setStatus('iniciando')
            setAttempt((a) => a + 1)
          }}
          className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <RefreshCcw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/40">
        {/* El video se espeja como un espejo real: menos desconcertante. */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-3/4 w-1/2 rounded-[50%] border-2 border-dashed border-white/40" />
        </div>
      </div>
      <p className="flex items-center gap-2 text-sm text-slate-300">
        <ScanFace className="h-4 w-4" />
        {STATUS_TEXT[status]}
      </p>
    </div>
  )
}
