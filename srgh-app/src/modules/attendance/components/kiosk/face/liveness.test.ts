import { describe, expect, it } from 'vitest'
import { createLivenessTracker } from './liveness'

function sample(blink: number, t: number) {
  return { blinkLeft: blink, blinkRight: blink, timestampMs: t }
}

describe('createLivenessTracker (prueba de vida por parpadeo)', () => {
  it('detecta la secuencia abierto → cerrado → abierto como persona viva', () => {
    const tracker = createLivenessTracker()

    expect(tracker.push(sample(0.1, 0))).toBe('esperando_parpadeo')
    expect(tracker.push(sample(0.8, 300))).toBe('esperando_parpadeo')
    expect(tracker.push(sample(0.05, 600))).toBe('vivo')
    expect(tracker.status()).toBe('vivo')
  })

  it('sin linea base de ojos abiertos sigue en esperando_ojos', () => {
    const tracker = createLivenessTracker()

    expect(tracker.push(sample(0.4, 0))).toBe('esperando_ojos')
    expect(tracker.push(sample(0.35, 200))).toBe('esperando_ojos')
  })

  it('un cierre sin reapertura no cuenta como parpadeo', () => {
    const tracker = createLivenessTracker()

    tracker.push(sample(0.1, 0))
    tracker.push(sample(0.9, 300))
    expect(tracker.status()).toBe('esperando_parpadeo')
  })

  it('exige que AMBOS ojos se cierren (un guiño no basta)', () => {
    const tracker = createLivenessTracker()

    tracker.push(sample(0.1, 0))
    tracker.push({ blinkLeft: 0.9, blinkRight: 0.1, timestampMs: 300 })
    tracker.push(sample(0.1, 600))
    expect(tracker.status()).toBe('esperando_parpadeo')
  })

  it('falla con sin_parpadeo al agotarse el tiempo (lentes oscuros / ojos tapados)', () => {
    const tracker = createLivenessTracker({ timeoutMs: 1000 })

    tracker.push(sample(0.4, 0))
    expect(tracker.push(sample(0.4, 1500))).toBe('sin_parpadeo')
    // El estado final es terminal: frames posteriores no lo reviven.
    expect(tracker.push(sample(0.9, 1600))).toBe('sin_parpadeo')
  })

  it('el estado vivo es terminal aunque sigan llegando frames', () => {
    const tracker = createLivenessTracker()

    tracker.push(sample(0.1, 0))
    tracker.push(sample(0.8, 100))
    tracker.push(sample(0.1, 200))
    expect(tracker.push(sample(0.8, 300))).toBe('vivo')
  })
})
