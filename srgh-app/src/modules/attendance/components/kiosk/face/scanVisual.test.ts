import { describe, expect, it } from 'vitest'
import { getScanVisual, LIVENESS_SHARE } from './scanVisual'

describe('getScanVisual', () => {
  it('arranca neutro y con el anillo vacío', () => {
    expect(getScanVisual({ phase: 'iniciando' })).toMatchObject({ tone: 'neutral', progress: 0 })
    expect(getScanVisual({ phase: 'buscando_rostro' })).toEqual({
      tone: 'neutral',
      progress: 0,
      message: 'Coloca tu rostro dentro del óvalo',
    })
  })

  it('al corregir la posición avisa en ámbar con la indicación y vacía el anillo', () => {
    expect(getScanVisual({ phase: 'ajusta_encuadre', hint: 'Quita la mano de la cara' })).toEqual({
      tone: 'warn',
      progress: 0,
      message: 'Quita la mano de la cara',
    })
    expect(getScanVisual({ phase: 'ajusta_encuadre' }).message).toBe(
      'Acomoda tu rostro dentro del óvalo'
    )
  })

  it('la prueba de vida llena el anillo hasta su parte y pide quedarse quieto', () => {
    const half = getScanVisual({ phase: 'evaluando', livenessSamples: 2, livenessNeeded: 4 })
    expect(half.tone).toBe('progress')
    expect(half.progress).toBeCloseTo(LIVENESS_SHARE / 2)
    expect(half.message).toBe('Quedate quieto, mirando a la cámara')
    // Más lecturas que las necesarias no pasan de su parte.
    expect(
      getScanVisual({ phase: 'evaluando', livenessSamples: 9, livenessNeeded: 4 }).progress
    ).toBeCloseTo(LIVENESS_SHARE)
    expect(getScanVisual({ phase: 'evaluando', livenessNeeded: 0 }).progress).toBe(0)
  })

  it('la captura completa el resto del anillo', () => {
    expect(getScanVisual({ phase: 'capturando', captureProgress: 0 }).progress).toBeCloseTo(
      LIVENESS_SHARE
    )
    expect(getScanVisual({ phase: 'capturando', captureProgress: 1 }).progress).toBeCloseTo(1)
    expect(getScanVisual({ phase: 'capturando', captureProgress: 5 }).progress).toBeCloseTo(1)
    expect(getScanVisual({ phase: 'capturando', captureProgress: NaN }).progress).toBeCloseTo(
      LIVENESS_SHARE
    )
  })

  it('una indicación durante la medición pasa a ámbar sin perder el avance', () => {
    const v = getScanVisual({
      phase: 'capturando',
      captureProgress: 0.5,
      hint: 'Mejora la luz y mantén el rostro quieto',
    })
    expect(v.tone).toBe('warn')
    expect(v.message).toBe('Mejora la luz y mantén el rostro quieto')
  })

  it('al terminar queda verde, lleno y avisa que ya se puede mover', () => {
    expect(getScanVisual({ phase: 'listo' })).toEqual({
      tone: 'done',
      progress: 1,
      message: 'Listo, ya podés moverte',
    })
  })
})
