import { describe, expect, it } from 'vitest'
import { formatHoursValue, hasSecondBlock, hoursBetween, templateHours } from './hours'

describe('hoursBetween', () => {
  it('calcula el tramo completo sin almuerzo ni break', () => {
    expect(hoursBetween('08:00', '16:00')).toBe(8)
  })

  it('resta el almuerzo completo', () => {
    expect(hoursBetween('08:00', '17:00', '12:00', '13:00')).toBe(8)
  })

  it('un break de hasta 10 minutos no descuenta nada (esta pagado)', () => {
    expect(hoursBetween('08:00', '16:00', null, null, '10:00', '10:10')).toBe(8)
  })

  it('un break de mas de 10 minutos solo descuenta el exceso', () => {
    // 70 min de break: 10 pagados + 60 de exceso -> se resta 1h de las 8h del tramo.
    expect(hoursBetween('08:00', '16:00', null, null, '10:00', '11:10')).toBe(7)
  })

  it('nunca da negativo aunque el tramo sea mas corto que los descuentos', () => {
    expect(hoursBetween('08:00', '08:30', '08:00', '08:30')).toBe(0)
  })
})

describe('formatHoursValue', () => {
  it('numeros enteros sin decimales', () => {
    expect(formatHoursValue(40)).toBe('40')
  })

  it('numeros con fraccion a un decimal', () => {
    expect(formatHoursValue(7.5)).toBe('7.5')
  })
})

describe('templateHours', () => {
  const base = {
    hor_hora_entrada: '08:00',
    hor_hora_salida: '17:00',
    hor_hora_inicio_almuerzo: '12:00',
    hor_hora_fin_almuerzo: '13:00',
  }

  it('con un solo bloque descuenta el almuerzo, igual que hoursBetween', () => {
    expect(templateHours(base)).toBe(8)
  })

  it('con un solo bloque tambien descuenta el exceso del break', () => {
    expect(
      templateHours({ ...base, hor_hora_inicio_break: '10:00', hor_hora_fin_break: '10:40' })
    ).toBe(7.5)
  })

  it('con segundo bloque suma los dos y no descuenta el hueco', () => {
    expect(
      templateHours({
        ...base,
        hor_hora_salida: '12:00',
        hor_hora_entrada_2: '14:00',
        hor_hora_salida_2: '18:00',
        // El almuerzo que guarda la base es el hueco; no debe restarse otra vez.
        hor_hora_inicio_almuerzo: '12:00',
        hor_hora_fin_almuerzo: '14:00',
      })
    ).toBe(8)
  })

  it('suma bloques de distinto largo, con medias horas', () => {
    expect(
      templateHours({
        hor_hora_entrada: '07:00',
        hor_hora_salida: '11:30',
        hor_hora_entrada_2: '16:00',
        hor_hora_salida_2: '20:00',
      })
    ).toBe(8.5)
  })

  it('un segundo bloque a medias se ignora', () => {
    expect(templateHours({ ...base, hor_hora_entrada_2: '18:00', hor_hora_salida_2: null })).toBe(8)
  })
})

describe('hasSecondBlock', () => {
  const base = { hor_hora_entrada: '08:00', hor_hora_salida: '12:00' }

  it('es verdadero solo con las dos horas del segundo bloque', () => {
    expect(
      hasSecondBlock({ ...base, hor_hora_entrada_2: '14:00', hor_hora_salida_2: '18:00' })
    ).toBe(true)
  })

  it.each([
    [null, null],
    ['14:00', null],
    [null, '18:00'],
    ['', ''],
  ])('es falso con (%s, %s)', (entrada2, salida2) => {
    expect(
      hasSecondBlock({ ...base, hor_hora_entrada_2: entrada2, hor_hora_salida_2: salida2 })
    ).toBe(false)
  })

  it('es falso cuando la plantilla no trae los campos', () => {
    expect(hasSecondBlock(base)).toBe(false)
  })
})
