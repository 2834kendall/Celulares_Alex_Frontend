import { describe, expect, it } from 'vitest'
import { prellenarDesdeAsistencia } from './prellenadoAsistencia'

/** Gabriela: ₡470.000 mensuales, jornada diurna de 48 h (96 h por quincena). */
const SALARIO = 470000
const DIURNA = 48

function lectura(horasOrdinarias: number, horasEsperadas: number, horasExtra = 0) {
  return { horasOrdinarias, horasEsperadas, horasExtra }
}

describe('prellenarDesdeAsistencia', () => {
  // El caso que llegó al usuario: un solo día programado (9 h), trabajado
  // completo. "Cumplió todo lo programado" daba la quincena entera: ₡235.000
  // por un día de trabajo. La quincena vale 96 h, y trabajó 9.
  it('paga las horas trabajadas contra la jornada del contrato, no contra lo programado', () => {
    const fila = prellenarDesdeAsistencia(SALARIO, lectura(9, 9, 3), DIURNA)

    expect(fila.horas).toBe(9)
    expect(fila.horasExtra).toBe(3)
    expect(fila.salarioPorHora).toBe(2447.92)
    // 235000 × 9 / 96
    expect(fila.base).toBe(22031.25)
    expect(fila.desdeAsistencia).toBe(true)
  })

  it('la quincena completa cobra exactamente salario ÷ 2, sin residuo de redondeo', () => {
    const fila = prellenarDesdeAsistencia(SALARIO, lectura(96, 96), DIURNA)

    expect(fila.base).toBe(235000)
    // Multiplicar la hora redondeada daría 234.999,32: por eso el base sale
    // de la proporción y no de horas × valor hora.
    expect(fila.salarioPorHora * 96).not.toBe(235000)
  })

  // Las horas de más no son ordinarias: van al banco de horas. Si el base
  // subiera con ellas se pagarían dos veces.
  it('trabajar más de la jornada no infla el base', () => {
    const fila = prellenarDesdeAsistencia(SALARIO, lectura(104, 104, 6), DIURNA)

    expect(fila.base).toBe(235000)
    expect(fila.horasExtra).toBe(6)
  })

  it('media quincena trabajada es medio salario quincenal', () => {
    const fila = prellenarDesdeAsistencia(SALARIO, lectura(48, 96), DIURNA)

    expect(fila.base).toBe(117500)
  })

  // La jornada del contrato es la que manda: el mismo salario en una jornada
  // parcial de 30 h semanales (60 por quincena) vale el doble por hora.
  it('respeta la jornada del contrato', () => {
    const parcial = prellenarDesdeAsistencia(SALARIO, lectura(30, 30), 30)

    expect(parcial.salarioPorHora).toBe(3916.67)
    expect(parcial.base).toBe(117500) // 30 de 60
  })

  it('sin jornada en el contrato supone la diurna de 48 h', () => {
    const fila = prellenarDesdeAsistencia(SALARIO, lectura(9, 9), null)

    expect(fila.base).toBe(22031.25)
  })

  // Sin horas programadas la lectura son ceros que no dicen nada. Se supone
  // la jornada completa, y se marca como supuesto para que quien llame avise.
  it('sin lectura utilizable supone la quincena entera y lo dice', () => {
    for (const totales of [null, lectura(0, 0), lectura(9, 0)]) {
      const fila = prellenarDesdeAsistencia(SALARIO, totales, DIURNA)

      expect(fila.horas).toBe(96)
      expect(fila.horasExtra).toBe(0)
      expect(fila.base).toBe(235000)
      expect(fila.salarioPorHora).toBe(2447.92)
      expect(fila.desdeAsistencia).toBe(false)
    }
  })

  it('sin salario no hay nada que prorratear', () => {
    const fila = prellenarDesdeAsistencia(0, lectura(9, 9), DIURNA)

    expect(fila.base).toBe(0)
    expect(fila.salarioPorHora).toBe(0)
  })
})
