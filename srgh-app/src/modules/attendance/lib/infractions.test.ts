import { describe, expect, it } from 'vitest'
import {
  classifyDay,
  classifyTardiness,
  countsTowardWarning,
  DEFAULT_TARDINESS_TYPES,
  shouldWarn,
  summarizeMonth,
  type DayForInfraction,
  type TardinessType,
} from './infractions'

/** El catalogo por defecto: leve desde 1, tardia desde 6, grave desde 11. */
const TIPOS = DEFAULT_TARDINESS_TYPES

function day(overrides: Partial<DayForInfraction> = {}): DayForInfraction {
  return {
    isJustifiedAbsence: false,
    isDayOff: false,
    isHoliday: false,
    expectedStart: '08:00',
    entradaTime: '08:00',
    isJustifiedTardiness: false,
    ...overrides,
  }
}

function tipo(overrides: Partial<TardinessType>): TardinessType {
  return {
    id: 1,
    nombre: 'Tipo',
    desdeMinutos: 1,
    cuentaAdvertencia: true,
    color: null,
    ...overrides,
  }
}

describe('classifyTardiness', () => {
  it('llegar a la hora o antes no es tardanza', () => {
    expect(classifyTardiness(0, TIPOS)).toBeNull()
    expect(classifyTardiness(-10, TIPOS)).toBeNull()
  })

  it('desde el primer minuto ya es tardia leve', () => {
    // 10:00 de turno y entro 10:01 — el caso textual del cliente.
    expect(classifyTardiness(1, TIPOS)?.nombre).toBe('Tardia leve')
  })

  it('cada tipo llega hasta un minuto antes del siguiente', () => {
    expect(classifyTardiness(5, TIPOS)?.nombre).toBe('Tardia leve')
    expect(classifyTardiness(6, TIPOS)?.nombre).toBe('Tardia')
    expect(classifyTardiness(10, TIPOS)?.nombre).toBe('Tardia')
  })

  it('el ultimo tipo queda abierto', () => {
    expect(classifyTardiness(11, TIPOS)?.nombre).toBe('Tardia grave')
    expect(classifyTardiness(90, TIPOS)?.nombre).toBe('Tardia grave')
  })

  it('un atraso menor al primer tipo no es tardanza: ese umbral reemplaza a la tolerancia', () => {
    const conGracia = [tipo({ nombre: 'Tarde', desdeMinutos: 5 })]

    expect(classifyTardiness(4, conGracia)).toBeNull()
    expect(classifyTardiness(5, conGracia)?.nombre).toBe('Tarde')
  })

  it('no depende del orden en que venga el catalogo', () => {
    const desordenado = [TIPOS[2], TIPOS[0], TIPOS[1]]

    expect(classifyTardiness(7, desordenado)?.nombre).toBe('Tardia')
  })

  it('sin tipos no hay tardanza', () => {
    expect(classifyTardiness(30, [])).toBeNull()
  })
})

describe('classifyDay', () => {
  it('es "no_aplica" en dia libre', () => {
    expect(classifyDay(day({ isDayOff: true }), TIPOS)).toBe('no_aplica')
  })

  it('es "no_aplica" en feriado', () => {
    expect(classifyDay(day({ isHoliday: true }), TIPOS)).toBe('no_aplica')
  })

  it('es "no_aplica" sin programacion', () => {
    expect(classifyDay(day({ expectedStart: null }), TIPOS)).toBe('no_aplica')
  })

  it('es "ausente" si no hay marca de entrada', () => {
    expect(classifyDay(day({ entradaTime: null }), TIPOS)).toBe('ausente')
  })

  it('es "no_aplica" con ausencia justificada, aunque el dia siga programado y sin marcar', () => {
    expect(
      classifyDay(
        day({ isJustifiedAbsence: true, entradaTime: null, expectedStart: '08:00' }),
        TIPOS
      )
    ).toBe('no_aplica')
  })

  it('la ausencia justificada tambien tapa una llegada tarde ese dia', () => {
    expect(
      classifyDay(
        day({ isJustifiedAbsence: true, expectedStart: '08:00', entradaTime: '10:30' }),
        TIPOS
      )
    ).toBe('no_aplica')
  })

  it('un solo minuto ya es tardio con el catalogo por defecto', () => {
    expect(classifyDay(day({ entradaTime: '08:01' }), TIPOS)).toBe('tardio')
  })

  it('es "a_tiempo" por debajo del primer tipo del catalogo', () => {
    const conGracia = [tipo({ desdeMinutos: 3 })]

    expect(classifyDay(day({ entradaTime: '08:02' }), conGracia)).toBe('a_tiempo')
    expect(classifyDay(day({ entradaTime: '08:03' }), conGracia)).toBe('tardio')
  })

  it('llegar temprano nunca es tardio', () => {
    expect(classifyDay(day({ entradaTime: '07:50' }), TIPOS)).toBe('a_tiempo')
  })

  it('una tardanza justificada se distingue, no se vuelve "a tiempo"', () => {
    // El atraso ocurrio y el reporte tiene que poder mostrarlo; lo que
    // cambia es que no suma.
    expect(classifyDay(day({ entradaTime: '08:20', isJustifiedTardiness: true }), TIPOS)).toBe(
      'tardio_justificado'
    )
  })

  it('justificar no inventa una tardanza donde no la hubo', () => {
    expect(classifyDay(day({ entradaTime: '08:00', isJustifiedTardiness: true }), TIPOS)).toBe(
      'a_tiempo'
    )
  })
})

describe('countsTowardWarning', () => {
  it('suma una tardanza de un tipo que cuenta', () => {
    expect(countsTowardWarning(day({ entradaTime: '08:02' }), TIPOS)).toBe(true)
  })

  it('no suma una tardanza justificada', () => {
    expect(
      countsTowardWarning(day({ entradaTime: '08:02', isJustifiedTardiness: true }), TIPOS)
    ).toBe(false)
  })

  it('no suma una tardanza de un tipo configurado para no contar', () => {
    const levesNoCuentan = [
      tipo({ id: 1, desdeMinutos: 1, cuentaAdvertencia: false }),
      tipo({ id: 2, desdeMinutos: 6, cuentaAdvertencia: true }),
    ]

    expect(countsTowardWarning(day({ entradaTime: '08:03' }), levesNoCuentan)).toBe(false)
    expect(countsTowardWarning(day({ entradaTime: '08:07' }), levesNoCuentan)).toBe(true)
  })

  it('llegar a tiempo no suma', () => {
    expect(countsTowardWarning(day({ entradaTime: '08:00' }), TIPOS)).toBe(false)
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

    expect(summarizeMonth(days, TIPOS)).toEqual({ tardias: 1, ausencias: 1 })
  })

  it('una tardanza justificada no suma al conteo del mes', () => {
    const days = [
      day({ entradaTime: '08:10' }),
      day({ entradaTime: '08:10', isJustifiedTardiness: true }),
      day({ entradaTime: '08:10', isJustifiedTardiness: true }),
    ]

    expect(summarizeMonth(days, TIPOS)).toEqual({ tardias: 1, ausencias: 0 })
    // Sin la exclusion, estas tres disparaban la advertencia del mes.
    expect(shouldWarn(summarizeMonth(days, TIPOS))).toBe(false)
  })

  it('tres tardias leves ya disparan la advertencia con el catalogo por defecto', () => {
    // Decision del cliente (2026-09-17): tres atrasos de un minuto bastan.
    const days = Array.from({ length: 3 }, () => day({ entradaTime: '08:01' }))

    expect(summarizeMonth(days, TIPOS)).toEqual({ tardias: 3, ausencias: 0 })
    expect(shouldWarn(summarizeMonth(days, TIPOS))).toBe(true)
  })

  it('si la empresa decide que las leves no cuenten, tres leves no avisan', () => {
    const levesNoCuentan = TIPOS.map((t) =>
      t.desdeMinutos === 1 ? { ...t, cuentaAdvertencia: false } : t
    )
    const days = Array.from({ length: 3 }, () => day({ entradaTime: '08:01' }))

    expect(summarizeMonth(days, levesNoCuentan)).toEqual({ tardias: 0, ausencias: 0 })
    expect(shouldWarn(summarizeMonth(days, levesNoCuentan))).toBe(false)
  })

  it('una semana de vacaciones aprobadas no suma ninguna ausencia', () => {
    const vacaciones = Array.from({ length: 5 }, () =>
      day({ isJustifiedAbsence: true, entradaTime: null })
    )

    expect(summarizeMonth(vacaciones, TIPOS)).toEqual({ tardias: 0, ausencias: 0 })
    // El limite de ausencias es 1: sin la exclusion, el primer dia de
    // vacaciones ya disparaba la advertencia del mes.
    expect(shouldWarn(summarizeMonth(vacaciones, TIPOS))).toBe(false)
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
