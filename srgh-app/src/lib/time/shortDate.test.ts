import { describe, expect, it } from 'vitest'
import {
  applyEdit,
  applyMask,
  digitsFromPaste,
  formatShortDate,
  onlyDigits,
  parseShortDate,
} from '@/lib/time/shortDate'

describe('onlyDigits', () => {
  it('descarta todo lo que no sea digito', () => {
    expect(onlyDigits('15/08/2026')).toBe('15082026')
    expect(onlyDigits('ab-1c5')).toBe('15')
  })

  it('recorta a los 8 digitos de ddmmaaaa', () => {
    expect(onlyDigits('150820261234')).toBe('15082026')
  })
})

describe('applyMask', () => {
  it('va insertando las barras tecla a tecla', () => {
    expect(applyMask('')).toBe('')
    expect(applyMask('1')).toBe('1')
    expect(applyMask('15')).toBe('15/')
    expect(applyMask('158')).toBe('15/8')
    expect(applyMask('1508')).toBe('15/08/')
    expect(applyMask('15082')).toBe('15/08/2')
    expect(applyMask('15082026')).toBe('15/08/2026')
  })

  it('ignora los no digitos que vengan en el texto', () => {
    expect(applyMask('15/08/2026')).toBe('15/08/2026')
    expect(applyMask('15-08-2026')).toBe('15/08/2026')
  })

  it('no deja pasar un noveno digito', () => {
    expect(applyMask('150820269')).toBe('15/08/2026')
  })
})

describe('applyEdit', () => {
  it('enmascara lo que se agrega', () => {
    expect(applyEdit('1', '15')).toBe('15/')
    expect(applyEdit('15/08/202', '15/08/2026')).toBe('15/08/2026')
  })

  // El caso que trababa el campo: la mascara repone la barra que se acaba de
  // borrar, asi que hay que llevarse el digito de atras con ella.
  it('al borrar una barra se lleva el digito anterior', () => {
    expect(applyEdit('15/', '15')).toBe('1')
    expect(applyEdit('15/08/', '15/08')).toBe('15/0')
  })

  it('al borrar un digito solo borra ese digito', () => {
    expect(applyEdit('15/08/2026', '15/08/202')).toBe('15/08/202')
    expect(applyEdit('15/8', '15/')).toBe('15/')
  })

  it('borrar todo deja el campo vacio', () => {
    expect(applyEdit('15/08/2026', '')).toBe('')
  })
})

describe('digitsFromPaste', () => {
  it('reacomoda los segmentos y rellena con cero', () => {
    expect(digitsFromPaste('15/8/2026')).toBe('15082026')
    expect(digitsFromPaste('5/8/2026')).toBe('05082026')
    expect(digitsFromPaste('15-08-2026')).toBe('15082026')
    expect(digitsFromPaste('15.08.2026')).toBe('15082026')
    expect(digitsFromPaste('15 08 2026')).toBe('15082026')
  })

  it('acepta los 8 digitos pegados de corrido', () => {
    expect(digitsFromPaste('15082026')).toBe('15082026')
  })

  it('descarta un año de dos cifras en vez de adivinar el siglo', () => {
    expect(digitsFromPaste('15/08/26')).toBe('')
    expect(digitsFromPaste('5-8-26')).toBe('')
  })

  it('descarta el ISO, que no es el formato de este campo', () => {
    expect(digitsFromPaste('2026-08-15')).toBe('')
  })

  it('descarta lo que no se parezca a una fecha', () => {
    expect(digitsFromPaste('')).toBe('')
    expect(digitsFromPaste('hola')).toBe('')
    expect(digitsFromPaste('1/2/3/4')).toBe('')
  })
})

describe('parseShortDate', () => {
  it('convierte una fecha completa a ISO', () => {
    expect(parseShortDate('15/08/2026')).toEqual({ state: 'ok', iso: '2026-08-15' })
    expect(parseShortDate('01/01/2000')).toEqual({ state: 'ok', iso: '2000-01-01' })
    expect(parseShortDate('10/03/1985')).toEqual({ state: 'ok', iso: '1985-03-10' })
  })

  it('tolera espacios alrededor', () => {
    expect(parseShortDate('  15/08/2026  ')).toEqual({ state: 'ok', iso: '2026-08-15' })
  })

  it('distingue vacio de incompleto', () => {
    expect(parseShortDate('')).toEqual({ state: 'empty' })
    expect(parseShortDate('   ')).toEqual({ state: 'empty' })
    expect(parseShortDate('15/')).toEqual({ state: 'incomplete' })
    expect(parseShortDate('15/08/')).toEqual({ state: 'incomplete' })
    expect(parseShortDate('15/08/20')).toEqual({ state: 'incomplete' })
  })

  // Es lo que un regex de formato no puede ver, y la razon de ser de esta
  // funcion: isValidISODate daria true para 2026-02-30.
  it('rechaza un dia que no existe en ese mes', () => {
    expect(parseShortDate('31/02/2026')).toEqual({ state: 'impossible' })
    expect(parseShortDate('31/04/2026')).toEqual({ state: 'impossible' })
  })

  it('rechaza dia y mes fuera de rango', () => {
    expect(parseShortDate('32/01/2026')).toEqual({ state: 'impossible' })
    expect(parseShortDate('00/01/2026')).toEqual({ state: 'impossible' })
    expect(parseShortDate('15/13/2026')).toEqual({ state: 'impossible' })
    expect(parseShortDate('15/00/2026')).toEqual({ state: 'impossible' })
  })

  it('conoce los años bisiestos', () => {
    expect(parseShortDate('29/02/2024')).toEqual({ state: 'ok', iso: '2024-02-29' })
    expect(parseShortDate('29/02/2025')).toEqual({ state: 'impossible' })
    expect(parseShortDate('29/02/2000')).toEqual({ state: 'ok', iso: '2000-02-29' })
    expect(parseShortDate('29/02/1900')).toEqual({ state: 'impossible' })
  })

  // new Date(85, 0, 1) es 1985, asi que el año dejaria de coincidir.
  it('rechaza un año de 0 a 99 escrito con cuatro cifras', () => {
    expect(parseShortDate('15/08/0085')).toEqual({ state: 'impossible' })
    expect(parseShortDate('15/08/0000')).toEqual({ state: 'impossible' })
  })
})

describe('formatShortDate', () => {
  it('convierte ISO a dd/mm/aaaa', () => {
    expect(formatShortDate('2026-08-15')).toBe('15/08/2026')
    expect(formatShortDate('1985-03-10')).toBe('10/03/1985')
  })

  it('devuelve vacio para lo que no sea ISO', () => {
    expect(formatShortDate('')).toBe('')
    expect(formatShortDate('15/08/2026')).toBe('')
    expect(formatShortDate('2026-8-15')).toBe('')
    expect(formatShortDate('cualquier cosa')).toBe('')
  })
})

// El ida y vuelta es el contrato que usa el componente: lo que se teclea se
// guarda en ISO, y lo que viene en ISO se vuelve a pintar igual.
describe('ida y vuelta', () => {
  it('format y parse son inversos', () => {
    for (const iso of ['2026-08-15', '2000-01-01', '1985-03-10', '2024-02-29']) {
      const resultado = parseShortDate(formatShortDate(iso))
      expect(resultado).toEqual({ state: 'ok', iso })
    }
  })
})
