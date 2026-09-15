import { describe, expect, it } from 'vitest'
import { HORAS_SEMANALES_POR_DEFECTO, horasJornadaQuincena, valorHoraOrdinaria } from './jornada'

describe('horasJornadaQuincena', () => {
  it('una jornada diurna de 48 h semanales son 96 por quincena', () => {
    expect(horasJornadaQuincena(48)).toBe(96)
  })

  it('respeta las jornadas que no son de tiempo completo', () => {
    expect(horasJornadaQuincena(30)).toBe(60) // parcial diurna
    expect(horasJornadaQuincena(36)).toBe(72) // nocturna
    expect(horasJornadaQuincena(70)).toBe(140) // acumulativa
  })

  // Sin jornada definida hay que suponer algo, y suponer la ordinaria diurna
  // es lo que menos daño hace: es la que tiene casi todo el mundo.
  it.each([[null], [undefined], [0], [-8], [Number.NaN]])(
    'cae a la jornada diurna cuando el contrato trae %s',
    (valor) => {
      expect(horasJornadaQuincena(valor as number)).toBe(HORAS_SEMANALES_POR_DEFECTO * 2)
    }
  )
})

describe('valorHoraOrdinaria', () => {
  it('sale del salario y de la jornada pactada, no de lo que se trabajó', () => {
    // 470 000 mensuales, jornada diurna: 470000 / 2 / 96
    expect(valorHoraOrdinaria(470000, 48)).toBe(2447.92)
  })

  // El bug que llegó al usuario: con un solo día programado en la quincena, el
  // valor hora salía de dividir el salario entre 9 horas y daba ₡26.111,11.
  // Como la hora extra se paga sobre ese número, el banco de horas sugería
  // pagar diez veces lo que correspondía.
  it('no cambia porque falten días por programar', () => {
    const conJornadaCompleta = valorHoraOrdinaria(470000, 48)

    expect(conJornadaCompleta).toBe(2447.92)
    expect(conJornadaCompleta).toBeLessThan(26111.11)
  })

  it('media jornada vale el doble por hora que la jornada completa', () => {
    // El mismo salario repartido en la mitad de las horas.
    expect(valorHoraOrdinaria(300000, 24)).toBe(valorHoraOrdinaria(300000, 48) * 2)
  })

  it('sin salario no hay valor hora que calcular', () => {
    expect(valorHoraOrdinaria(0, 48)).toBe(0)
    expect(valorHoraOrdinaria(-100, 48)).toBe(0)
  })

  // La hora extra se paga sobre este valor, por ley a tiempo y medio.
  it('la hora extra de una jornada diurna sale a tiempo y medio del valor real', () => {
    const hora = valorHoraOrdinaria(480000, 48) // 480000 / 2 / 96 = 2500

    expect(hora).toBe(2500)
    expect(hora * 1.5).toBe(3750)
  })
})
