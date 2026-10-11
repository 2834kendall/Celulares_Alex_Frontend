import { describe, expect, it } from 'vitest'
import { formatHora, formatRangoHora, isFormatoHora, parseFormatoHora } from './formatoHora'

describe('formatHora', () => {
  describe('24h', () => {
    it('deja la hora como está, con cero a la izquierda', () => {
      expect(formatHora('08:35', '24h')).toBe('08:35')
      expect(formatHora('17:05', '24h')).toBe('17:05')
    })

    it('recorta los segundos de un "HH:MM:SS"', () => {
      expect(formatHora('08:35:00', '24h')).toBe('08:35')
    })

    it('agrega el cero a la izquierda si falta', () => {
      expect(formatHora('8:35', '24h')).toBe('08:35')
    })
  })

  describe('12h', () => {
    it('mañana → a. m. sin cero a la izquierda', () => {
      expect(formatHora('08:35', '12h')).toBe('8:35 a. m.')
    })

    it('tarde → p. m.', () => {
      expect(formatHora('17:05', '12h')).toBe('5:05 p. m.')
    })

    // Los dos casos que siempre se rompen al pasar a 12h.
    it('medianoche es 12 a. m., no 0', () => {
      expect(formatHora('00:05', '12h')).toBe('12:05 a. m.')
      expect(formatHora('00:00', '12h')).toBe('12:00 a. m.')
    })

    it('mediodía es 12 p. m., no 12 a. m.', () => {
      expect(formatHora('12:00', '12h')).toBe('12:00 p. m.')
      expect(formatHora('12:30', '12h')).toBe('12:30 p. m.')
    })

    it('11:59 p. m. es el último minuto del día', () => {
      expect(formatHora('23:59', '12h')).toBe('11:59 p. m.')
    })

    it('acepta "HH:MM:SS"', () => {
      expect(formatHora('13:45:30', '12h')).toBe('1:45 p. m.')
    })
  })

  it('null/undefined/vacío → null, para que el llamador decida el "—"', () => {
    expect(formatHora(null, '12h')).toBeNull()
    expect(formatHora(undefined, '24h')).toBeNull()
    expect(formatHora('', '12h')).toBeNull()
  })

  it('un texto que no es una hora se devuelve tal cual en vez de romper', () => {
    expect(formatHora('sin marca', '12h')).toBe('sin marca')
  })
})

describe('formatRangoHora', () => {
  it('une inicio y fin con el formato elegido', () => {
    expect(formatRangoHora('08:00', '17:00', '24h')).toBe('08:00 - 17:00')
    expect(formatRangoHora('08:00', '17:00', '12h')).toBe('8:00 a. m. - 5:00 p. m.')
  })

  it('si falta un extremo devuelve null, no "08:00 - —"', () => {
    expect(formatRangoHora('08:00', null, '12h')).toBeNull()
    expect(formatRangoHora(null, '17:00', '24h')).toBeNull()
  })
})

describe('parseFormatoHora', () => {
  it('acepta los dos valores válidos', () => {
    expect(parseFormatoHora('12h')).toBe('12h')
    expect(parseFormatoHora('24h')).toBe('24h')
  })

  it('cualquier otra cosa cae al default 24h, nunca rompe', () => {
    expect(parseFormatoHora(null)).toBe('24h')
    expect(parseFormatoHora('12H')).toBe('24h')
    expect(parseFormatoHora(undefined)).toBe('24h')
  })

  it('isFormatoHora distingue lo válido', () => {
    expect(isFormatoHora('12h')).toBe(true)
    expect(isFormatoHora('am/pm')).toBe(false)
  })
})
