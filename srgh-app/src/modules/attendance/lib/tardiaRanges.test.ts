import { describe, expect, it } from 'vitest'
import { rangeLabel, withNextStart } from './tardiaRanges'

describe('rangeLabel', () => {
  it('describe un rango que termina un minuto antes del siguiente tipo', () => {
    expect(rangeLabel(1, 6)).toBe('1 a 5 min')
  })

  it('deja abierto el ultimo tipo', () => {
    expect(rangeLabel(11, null)).toBe('11 min o mas')
  })

  it('un rango de un solo minuto no se escribe "5 a 5"', () => {
    expect(rangeLabel(5, 6)).toBe('5 min')
  })
})

describe('withNextStart', () => {
  it('ordena por el minuto de inicio y empareja cada tipo con el siguiente', () => {
    const tipos = [{ tta_desde_minutos: 11 }, { tta_desde_minutos: 1 }, { tta_desde_minutos: 6 }]

    expect(withNextStart(tipos).map((f) => [f.tipo.tta_desde_minutos, f.siguienteDesde])).toEqual([
      [1, 6],
      [6, 11],
      [11, null],
    ])
  })
})
