import { describe, expect, it } from 'vitest'
import {
  classifyDay,
  classifyTardiness,
  shouldWarn,
  summarizeMonth,
  type DayForInfraction,
} from './infractions'

function day(overrides: Partial<DayForInfraction> = {}): DayForInfraction {
  return {
    isJustifiedAbsence: false,
    isDayOff: false,
    isHoliday: false,
    expectedStart: '08:00',
    entradaTime: '08:00',
    toleranciaMinutos: 2,
    isJustifiedTardiness: false,
    ...overrides,
  }
}

describe('classifyTardiness', () => {
  it('llegar a la hora o antes no es tardanza', () => {
    expect(classifyTardiness(0)).toBeNull()
    expect(classifyTardiness(-10)).toBeNull()
  })

  it('desde el primer minuto ya es tardia leve', () => {
    // 10:00 de turno y entro 10:01 — el caso textual del cliente.
    expect(classifyTardiness(1)).toBe('leve')
  })

  it('leve llega hasta el minuto 5 inclusive', () => {
    expect(classifyTardiness(5)).toBe('leve')
  })

  it('"despues de 5 minutos" arranca en el 6', () => {
    expect(classifyTardiness(6)).toBe('tardia')
    expect(classifyTardiness(10)).toBe('tardia')
  })

  it('"mas de 10" arranca en el 11', () => {
    expect(classifyTardiness(11)).toBe('grave')
    expect(classifyTardiness(90)).toBe('grave')
  })
})

describe('classifyDay', () => {
  it('es "no_aplica" en dia libre', () => {
    expect(classifyDay(day({ isDayOff: true }))).toBe('no_aplica')
  })

  it('es "no_aplica" en feriado', () => {
    expect(classifyDay(day({ isHoliday: true }))).toBe('no_aplica')
  })

  it('es "no_aplica" sin programacion', () => {
    expect(classifyDay(day({ expectedStart: null }))).toBe('no_aplica')
  })

  it('es "ausente" si no hay marca de entrada', () => {
    expect(classifyDay(day({ entradaTime: null }))).toBe('ausente')
  })

  it('es "no_aplica" con ausencia justificada, aunque el dia siga programado y sin marcar', () => {
    expect(
      classifyDay(day({ isJustifiedAbsence: true, entradaTime: null, expectedStart: '08:00' }))
    ).toBe('no_aplica')
  })

  it('la ausencia justificada tambien tapa una llegada tarde ese dia', () => {
    expect(
      classifyDay(day({ isJustifiedAbsence: true, expectedStart: '08:00', entradaTime: '10:30' }))
    ).toBe('no_aplica')
  })

  it('es "a_tiempo" dentro de la tolerancia', () => {
    expect(
      classifyDay(day({ expectedStart: '08:00', entradaTime: '08:02', toleranciaMinutos: 2 }))
    ).toBe('a_tiempo')
  })

  it('es "tardio" fuera de la tolerancia', () => {
    expect(
      classifyDay(day({ expectedStart: '08:00', entradaTime: '08:03', toleranciaMinutos: 2 }))
    ).toBe('tardio')
  })

  it('llegar temprano nunca es tardio', () => {
    expect(classifyDay(day({ expectedStart: '08:00', entradaTime: '07:50' }))).toBe('a_tiempo')
  })

  it('con la tolerancia en 0, un solo minuto ya es tardio', () => {
    // Es el valor por defecto desde SGRH-87: sin esto, la banda leve
    // (1-5 min) seria inalcanzable.
    expect(
      classifyDay(day({ expectedStart: '08:00', entradaTime: '08:01', toleranciaMinutos: 0 }))
    ).toBe('tardio')
  })

  it('una tardanza justificada se distingue, no se vuelve "a tiempo"', () => {
    // El atraso ocurrio y el reporte tiene que poder mostrarlo; lo que
    // cambia es que no suma.
    expect(
      classifyDay(
        day({
          expectedStart: '08:00',
          entradaTime: '08:20',
          toleranciaMinutos: 0,
          isJustifiedTardiness: true,
        })
      )
    ).toBe('tardio_justificado')
  })

  it('justificar no inventa una tardanza donde no la hubo', () => {
    expect(
      classifyDay(day({ expectedStart: '08:00', entradaTime: '08:00', isJustifiedTardiness: true }))
    ).toBe('a_tiempo')
  })
})

describe('summarizeMonth', () => {
  it('cuenta tardias y ausencias por separado, ignorando dias no_aplica', () => {
    const days = [
      day({ entradaTime: '08:00' }), // a_tiempo
      day({ entradaTime: '08:10' }), // tardio
      day({ entradaTime: null }), // ausente
      day({ isDayOff: true }), // no_aplica
    ]

    expect(summarizeMonth(days)).toEqual({ tardias: 1, ausencias: 1 })
  })

  it('una tardanza justificada no suma al conteo del mes', () => {
    const days = [
      day({ entradaTime: '08:10' }), // tardio
      day({ entradaTime: '08:10', isJustifiedTardiness: true }), // tardio_justificado
      day({ entradaTime: '08:10', isJustifiedTardiness: true }), // tardio_justificado
    ]

    expect(summarizeMonth(days)).toEqual({ tardias: 1, ausencias: 0 })
    // Sin la exclusion, estas tres disparaban la advertencia del mes.
    expect(shouldWarn(summarizeMonth(days))).toBe(false)
  })

  it('tres tardias leves ya disparan la advertencia: la banda no filtra el conteo', () => {
    // Decision del cliente (2026-09-17). Con tolerancia 0, tres atrasos de
    // un minuto bastan.
    const days = Array.from({ length: 3 }, () =>
      day({ entradaTime: '08:01', toleranciaMinutos: 0 })
    )

    expect(summarizeMonth(days)).toEqual({ tardias: 3, ausencias: 0 })
    expect(shouldWarn(summarizeMonth(days))).toBe(true)
  })

  it('una semana de vacaciones aprobadas no suma ninguna ausencia', () => {
    const vacaciones = Array.from({ length: 5 }, () =>
      day({ isJustifiedAbsence: true, entradaTime: null })
    )

    expect(summarizeMonth(vacaciones)).toEqual({ tardias: 0, ausencias: 0 })
    // El limite de ausencias es 1: sin la exclusion, el primer dia de
    // vacaciones ya disparaba la advertencia del mes.
    expect(shouldWarn(summarizeMonth(vacaciones))).toBe(false)
  })
})

describe('shouldWarn', () => {
  it('no advierte por debajo de los limites', () => {
    expect(shouldWarn({ tardias: 2, ausencias: 0 })).toBe(false)
  })

  it('advierte con 3 tardias', () => {
    expect(shouldWarn({ tardias: 3, ausencias: 0 })).toBe(true)
  })

  it('advierte con 1 ausencia', () => {
    expect(shouldWarn({ tardias: 0, ausencias: 1 })).toBe(true)
  })
})
