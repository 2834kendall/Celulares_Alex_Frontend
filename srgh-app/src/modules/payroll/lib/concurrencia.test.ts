import { describe, expect, it } from 'vitest'
import { mapConLimite } from './concurrencia'

describe('mapConLimite', () => {
  it('devuelve los resultados en el orden de entrada aunque terminen desordenados', async () => {
    const r = await mapConLimite([30, 5, 20, 1], 4, async (ms, i) => {
      await new Promise((ok) => setTimeout(ok, ms))
      return `${i}:${ms}`
    })

    expect(r).toEqual(['0:30', '1:5', '2:20', '3:1'])
  })

  it('nunca tiene más llamadas en vuelo que el límite', async () => {
    let enVuelo = 0
    let maximo = 0
    await mapConLimite(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        enVuelo += 1
        maximo = Math.max(maximo, enVuelo)
        await new Promise((ok) => setTimeout(ok, 5))
        enVuelo -= 1
      }
    )

    expect(maximo).toBe(3)
  })

  it('sin elementos no llama nada', async () => {
    let llamadas = 0
    const r = await mapConLimite([], 4, async () => {
      llamadas += 1
    })

    expect(r).toEqual([])
    expect(llamadas).toBe(0)
  })
})
