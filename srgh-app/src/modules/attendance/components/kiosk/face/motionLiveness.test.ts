import { describe, expect, it } from 'vitest'
import { computeNonRigidityScore, createMotionLivenessTracker } from './motionLiveness'
import type { FaceLandmark, MotionLivenessFrame } from './motionLiveness'

const RIGHT_EYE_OUTER = 33
const LEFT_EYE_OUTER = 263
const MOUTH_RIGHT = 61
const MOUTH_LEFT = 291
const NOSE_TIP = 1
const CHIN = 152

/** Arreglo lo bastante largo con landmarks base "neutrales" en los indices que usa el modulo. */
function baseLandmarks(): FaceLandmark[] {
  const arr: FaceLandmark[] = new Array(300).fill(null).map(() => ({ x: 0.5, y: 0.5 }))
  arr[RIGHT_EYE_OUTER] = { x: 0.4, y: 0.4 }
  arr[LEFT_EYE_OUTER] = { x: 0.6, y: 0.4 }
  arr[MOUTH_RIGHT] = { x: 0.45, y: 0.6 }
  arr[MOUTH_LEFT] = { x: 0.55, y: 0.6 }
  arr[NOSE_TIP] = { x: 0.5, y: 0.5 }
  arr[CHIN] = { x: 0.5, y: 0.7 }
  return arr
}

function withOffset(landmarks: FaceLandmark[], dx: number, dy: number): FaceLandmark[] {
  return landmarks.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

function withScale(landmarks: FaceLandmark[], factor: number, cx = 0.5, cy = 0.5): FaceLandmark[] {
  return landmarks.map((p) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  }))
}

function withRotation(landmarks: FaceLandmark[], angleRad: number, cx = 0.5, cy = 0.5) {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return landmarks.map((p) => {
    const rx = p.x - cx
    const ry = p.y - cy
    return { x: cx + rx * cos - ry * sin, y: cy + rx * sin + ry * cos }
  })
}

function frame(landmarks: FaceLandmark[], timestampMs: number): MotionLivenessFrame {
  return { landmarks, timestampMs }
}

describe('computeNonRigidityScore', () => {
  it('es 0 si el rostro se mueve como bloque rigido (traslacion)', () => {
    const base = baseLandmarks()
    const frames = [0, 100, 200, 300].map((t) => frame(withOffset(base, t * 0.001, 0), t))
    expect(computeNonRigidityScore(frames)).toBeCloseTo(0, 5)
  })

  it('es 0 si el rostro se mueve como bloque rigido (rotacion)', () => {
    const base = baseLandmarks()
    const frames = [0, 100, 200, 300].map((t) => frame(withRotation(base, (t / 300) * 0.3), t))
    expect(computeNonRigidityScore(frames)).toBeCloseTo(0, 5)
  })

  it('es 0 si el rostro se mueve como bloque rigido (escala/zoom)', () => {
    const base = baseLandmarks()
    const frames = [0, 100, 200, 300].map((t) => frame(withScale(base, 1 + t * 0.0005), t))
    expect(computeNonRigidityScore(frames)).toBeCloseTo(0, 5)
  })

  it('es mayor que 0 si un punto de expresion se mueve independiente de los ojos', () => {
    const base = baseLandmarks()
    const frames = [0, 100, 200, 300].map((t) => {
      const landmarks = [...base]
      // La comisura de la boca se separa progresivamente (una sonrisa leve),
      // sin que los ojos (el ancla) se muevan — deformacion NO rigida.
      landmarks[MOUTH_LEFT] = { x: 0.55 + t * 0.0003, y: 0.6 }
      return frame(landmarks, t)
    })
    expect(computeNonRigidityScore(frames)).toBeGreaterThan(0.02)
  })

  it('devuelve 0 con menos de 2 frames', () => {
    expect(computeNonRigidityScore([])).toBe(0)
    expect(computeNonRigidityScore([frame(baseLandmarks(), 0)])).toBe(0)
  })
})

describe('createMotionLivenessTracker', () => {
  it('empieza "recolectando" antes de juntar el minimo de frames', () => {
    const tracker = createMotionLivenessTracker()
    expect(tracker.push(frame(baseLandmarks(), 0))).toBe('recolectando')
  })

  it('detecta "vivo" cuando hay deformacion no-rigida sostenida', () => {
    const tracker = createMotionLivenessTracker({ minFrames: 3, nonRigidThreshold: 0.01 })
    const base = baseLandmarks()

    let lastStatus
    for (let i = 0; i < 6; i++) {
      const t = i * 100
      const landmarks = [...base]
      landmarks[MOUTH_LEFT] = { x: 0.55 + i * 0.002, y: 0.6 }
      lastStatus = tracker.push(frame(landmarks, t))
    }

    expect(lastStatus).toBe('vivo')
    expect(tracker.status()).toBe('vivo')
  })

  it('con el umbral por defecto, un temblor leve (paralaje de foto sostenida a mano) no alcanza "vivo"', () => {
    // Antes del endurecimiento (0.012) esto alcanzaba para "vivo": una foto
    // sostenida a mano vibra/se ladea un poco, lo que via paralaje se ve
    // como una deformacion no-rigida pequeña aunque el objeto sea rigido.
    const tracker = createMotionLivenessTracker({ timeoutMs: 300, minFrames: 3 })
    const base = baseLandmarks()

    let lastStatus
    for (let t = 0; t <= 300; t += 100) {
      const landmarks = [...base]
      landmarks[MOUTH_LEFT] = { x: 0.55 + Math.sin(t) * 0.0015, y: 0.6 }
      lastStatus = tracker.push(frame(landmarks, t))
    }

    expect(lastStatus).not.toBe('vivo')
  })

  it('cae a "requiere_parpadeo" si nunca hay suficiente deformacion no-rigida (foto rigida)', () => {
    const tracker = createMotionLivenessTracker({ timeoutMs: 500, minFrames: 3 })
    const base = baseLandmarks()

    let lastStatus
    // Se mueve, pero siempre como bloque rigido (traslacion) — nunca deforma.
    for (let t = 0; t <= 700; t += 100) {
      lastStatus = tracker.push(frame(withOffset(base, t * 0.0005, 0), t))
    }

    expect(lastStatus).toBe('requiere_parpadeo')
  })

  it('el resultado es terminal: no cambia despues de decidir', () => {
    const tracker = createMotionLivenessTracker({ timeoutMs: 100, minFrames: 3 })
    const base = baseLandmarks()

    tracker.push(frame(base, 0))
    tracker.push(frame(base, 50))
    tracker.push(frame(base, 200)) // supera el timeout -> requiere_parpadeo

    expect(tracker.status()).toBe('requiere_parpadeo')

    // Un frame posterior con deformacion fuerte no debe revertir la decision.
    const landmarks = [...base]
    landmarks[MOUTH_LEFT] = { x: 0.9, y: 0.9 }
    tracker.push(frame(landmarks, 9000))

    expect(tracker.status()).toBe('requiere_parpadeo')
  })

  it('no revienta si faltan los landmarks de un frame', () => {
    const tracker = createMotionLivenessTracker({ minFrames: 2 })
    expect(() => tracker.push({ landmarks: [], timestampMs: 0 })).not.toThrow()
  })
})
