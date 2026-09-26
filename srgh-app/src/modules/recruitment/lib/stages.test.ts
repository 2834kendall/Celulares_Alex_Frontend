import { describe, expect, it } from 'vitest'
import { compareStages, isForward, sortStages, stagesAfter } from './stages'

const recepcion = { id: 1, fase: 1, orden: 1 }
const entrevista = { id: 2, fase: 2, orden: 30 }
const prueba = { id: 3, fase: 2, orden: 31 }
// Creada ANTES que las otras (orden menor) pero en la columna de Decisión:
// igual va al final del embudo.
const decision = { id: 4, fase: 3, orden: 5 }

describe('orden del embudo', () => {
  it('ordena primero por columna y después por el orden configurado', () => {
    expect(sortStages([decision, prueba, recepcion, entrevista]).map((s) => s.id)).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('compareStages: la misma etapa no es "después"', () => {
    expect(compareStages(prueba, prueba)).toBe(0)
  })
})

describe('solo hacia adelante', () => {
  it('desde "Prueba práctica" solo se puede ir a las posteriores', () => {
    expect(stagesAfter([recepcion, entrevista, prueba, decision], prueba).map((s) => s.id)).toEqual(
      [4]
    )
  })

  it('no se puede volver atrás ni repetir la etapa actual', () => {
    expect(isForward(prueba, entrevista)).toBe(false)
    expect(isForward(prueba, prueba)).toBe(false)
    expect(isForward(prueba, decision)).toBe(true)
  })

  it('sin etapa actual (postulación nueva) todas son válidas', () => {
    expect(stagesAfter([decision, recepcion], null).map((s) => s.id)).toEqual([1, 4])
    expect(isForward(null, recepcion)).toBe(true)
  })
})
