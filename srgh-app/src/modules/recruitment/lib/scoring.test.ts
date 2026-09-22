import { describe, expect, it } from 'vitest'
import { averageScore } from '@/modules/evaluations/lib/scoring'
import { weightedAverageScore } from './scoring'

describe('weightedAverageScore', () => {
  it('sin criterios aplicables devuelve null', () => {
    expect(weightedAverageScore([])).toBeNull()
    expect(weightedAverageScore([{ puntaje: null, peso: 1 }])).toBeNull()
  })

  it('con todos los pesos en 1 da lo mismo que el promedio simple', () => {
    const puntajes = [8, 6, 9, 7]
    const ponderado = weightedAverageScore(puntajes.map((puntaje) => ({ puntaje, peso: 1 })))

    expect(ponderado).toBe(averageScore(puntajes))
  })

  it('un criterio con peso 2 arrastra el promedio hacia su nota', () => {
    // Simple: (10 + 4) / 2 = 7. Con el 4 pesando doble: (10 + 8) / 3 = 6.
    expect(
      weightedAverageScore([
        { puntaje: 10, peso: 1 },
        { puntaje: 4, peso: 2 },
      ])
    ).toBe(6)
  })

  it('los criterios que no aplican quedan fuera y no diluyen el puntaje', () => {
    // Solo cuenta el 8: el null no suma ni al numerador ni al peso total.
    expect(
      weightedAverageScore([
        { puntaje: 8, peso: 1 },
        { puntaje: null, peso: 5 },
      ])
    ).toBe(8)
  })

  it('redondea a entero, igual que la escala de evaluaciones', () => {
    // (7*1 + 8*1) / 2 = 7.5 → 8
    expect(
      weightedAverageScore([
        { puntaje: 7, peso: 1 },
        { puntaje: 8, peso: 1 },
      ])
    ).toBe(8)
  })

  it('soporta pesos decimales', () => {
    // (10*0.5 + 5*1.5) / 2 = 6.25 → 6
    expect(
      weightedAverageScore([
        { puntaje: 10, peso: 0.5 },
        { puntaje: 5, peso: 1.5 },
      ])
    ).toBe(6)
  })

  it('un peso 0 no participa (aunque el CHECK de la tabla ya lo impide)', () => {
    expect(
      weightedAverageScore([
        { puntaje: 9, peso: 1 },
        { puntaje: 1, peso: 0 },
      ])
    ).toBe(9)
  })
})
