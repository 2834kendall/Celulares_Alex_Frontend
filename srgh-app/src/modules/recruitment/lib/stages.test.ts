import { describe, expect, it } from 'vitest'
import { nextStage, sortStageRows } from './stages'

describe('sortStageRows — orden de las columnas', () => {
  it('sin fase (catálogo ya reordenado) manda solo eta_orden', () => {
    const rows = [
      { eta_id: 3, eta_orden: 2, eta_fase: null },
      { eta_id: 1, eta_orden: 3, eta_fase: null },
      { eta_id: 2, eta_orden: 1, eta_fase: null },
    ]
    expect(sortStageRows(rows).map((r) => r.eta_id)).toEqual([2, 3, 1])
  })

  it('respeta el orden histórico (fase y después orden) mientras nadie reordene', () => {
    const rows = [
      // "Decisión" creada antes que las de evaluación: igual iba al final.
      { eta_id: 4, eta_orden: 1, eta_fase: 3 },
      { eta_id: 2, eta_orden: 30, eta_fase: 2 },
      { eta_id: 1, eta_orden: 40, eta_fase: 1 },
      { eta_id: 3, eta_orden: 31, eta_fase: 2 },
    ]
    expect(sortStageRows(rows).map((r) => r.eta_id)).toEqual([1, 2, 3, 4])
  })

  it('una etapa nueva (sin fase) va después de las que todavía tienen fase', () => {
    const rows = [
      { eta_id: 9, eta_orden: 1, eta_fase: null },
      { eta_id: 1, eta_orden: 50, eta_fase: 3 },
    ]
    expect(sortStageRows(rows).map((r) => r.eta_id)).toEqual([1, 9])
  })

  it('no modifica el arreglo original', () => {
    const rows = [
      { eta_id: 2, eta_orden: 2, eta_fase: null },
      { eta_id: 1, eta_orden: 1, eta_fase: null },
    ]
    sortStageRows(rows)
    expect(rows.map((r) => r.eta_id)).toEqual([2, 1])
  })
})

describe('nextStage', () => {
  const stages = [
    { id: 10, orden: 0 },
    { id: 20, orden: 1 },
    { id: 30, orden: 2 },
  ]

  it('sin etapa actual ofrece la primera columna', () => {
    expect(nextStage(stages, null)?.id).toBe(10)
  })

  it('devuelve la columna siguiente', () => {
    expect(nextStage(stages, { id: 20, orden: 1 })?.id).toBe(30)
  })

  it('en la última columna no hay siguiente', () => {
    expect(nextStage(stages, { id: 30, orden: 2 })).toBeNull()
  })

  it('si la etapa actual ya no es una columna, ofrece la primera', () => {
    expect(nextStage(stages, { id: 99, orden: -1 })?.id).toBe(10)
  })

  it('sin columnas no hay siguiente', () => {
    expect(nextStage([], null)).toBeNull()
  })
})
