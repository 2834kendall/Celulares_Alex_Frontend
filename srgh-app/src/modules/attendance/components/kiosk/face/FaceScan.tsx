'use client'

import { useEffect, useRef, useState } from 'react'
import { ScanFace } from 'lucide-react'
import { encryptVector, type EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import { FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'
import { getFaceLandmarker } from './faceLandmarker'
import { computeEmbedding, preloadEmbeddingModel } from './embedding'
import { eyeTiltAngle, faceCropBox, firstFaceLandmarks } from './landmarks'

/** Frames consecutivos con rostro detectado antes de capturar (evita un frame borroso/de transicion). */
const STABLE_FRAMES_REQUIRED = 5

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

type ScanStatus = 'iniciando' | 'buscando_rostro' | 'procesando'

const STATUS_TEXT: Record<ScanStatus, string> = {
  iniciando: 'Preparando la camara…',
  buscando_rostro: 'Coloca tu rostro frente a la camara',
  procesando: 'Verificando…',
}

/**
 * Captura facial. Todo el procesamiento pesado ocurre en el cliente:
 * MediaPipe ubica el rostro y da los landmarks, el recorte pasa por la red
 * de reconocimiento de face-api.js (TensorFlow.js) y el vector sale cifrado
 * (AES-256-GCM). La foto jamas abandona este componente.
 *
 * SIN prueba de vida (decision explicita del negocio, 2026-07-31): se
 * probaron dos chequeos — movimiento pasivo (motionLiveness.ts) y parpadeo
 * explicito (liveness.ts) — y ambos quedan en el repo pero NINGUNO esta
 * conectado aca. Motivo del negocio: friccion inaceptable en el kiosco.
 * Consecuencia conocida y aceptada: una foto de alguien ya enrolado puede
 * marcar como esa persona — reconocer BIEN de quien es una cara (align de
 * ojos, ver landmarks.ts/embedding.ts) no resuelve esto, porque reconocer
 * "quien" y verificar "vivo o foto" son preguntas distintas. Si el negocio
 * cambia de postura, liveness.ts es el camino mas simple para reactivar
 * (ver el commit que quito su uso de aca).
 */
export function FaceScan({ onEmbedding, onUnavailable }: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const stableCountRef = useRef(0)
  const doneRef = useRef(false)
  const unavailableRef = useRef(false)

  const [status, setStatus] = useState<ScanStatus>('iniciando')

  useEffect(() => {
    let cancelled = false
    doneRef.current = false
    stableCountRef.current = 0

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

        if (!landmarks) {
          stableCountRef.current = 0
          setStatus('buscando_rostro')
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        stableCountRef.current += 1
        if (stableCountRef.current < STABLE_FRAMES_REQUIRED) {
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        // Rostro detectado de forma estable: recortar y generar el embedding.
        doneRef.current = true
        setStatus('procesando')

        const box = faceCropBox(landmarks, v.videoWidth, v.videoHeight)
        const angle = eyeTiltAngle(landmarks, v.videoWidth, v.videoHeight)
        if (!box || angle === null) {
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
  }, [onEmbedding, onUnavailable])

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
