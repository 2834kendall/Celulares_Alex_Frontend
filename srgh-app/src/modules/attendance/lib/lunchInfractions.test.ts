import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TARDINESS_TYPES,
  lunchCountsTowardWarning,
  secondBlockCountsTowardWarning,
  secondBlockLateMinutes,
  secondBlockTardinessOfDay,
  lunchLateMinutes,
  lunchTardinessOfDay,
  periodExcessMinutes,
  summarizeMonth,
  type DayForInfraction,
} from './infractions'

const TIPOS = DEFAULT_TARDINESS_TYPES

function day(overrides: Partial<DayForInfraction> = {}): DayForInfraction {
  return {
    isJustifiedAbsence: false,
    isDayOff: false,
    isHoliday: false,
    expectedStart: '08:00',
    entradaTime: '08:00',
    isJustifiedTardiness: false,
    inicioAlmuerzoTime: '12:00',
    finAlmuerzoTime: '13:00',
    isJustifiedLunchTardiness: false,
    ...overrides,
  }
}

describe('lunchTardinessOfDay', () => {
  it('volver a tiempo no es tardanza', () => {
    expect(lunchTardinessOfDay(day(), TIPOS)).toBeNull()
  })

  it('usa el mismo catalogo que la entrada', () => {
    expect(lunchTardinessOfDay(day({ finAlmuerzoTime: '13:03' }), TIPOS)?.nombre).toBe(
      'Tardia leve'
    )
    expect(lunchTardinessOfDay(day({ finAlmuerzoTime: '13:12' }), TIPOS)?.nombre).toBe(
      'Tardia grave'
    )
  })

  it('la hora corre desde la marca de inicio, no desde el horario', () => {
    // Empezo 12:40: vuelve a tiempo hasta las 13:40.
    expect(
      lunchTardinessOfDay(day({ inicioAlmuerzoTime: '12:40', finAlmuerzoTime: '13:40' }), TIPOS)
    ).toBeNull()
    expect(
      lunchTardinessOfDay(day({ inicioAlmuerzoTime: '12:40', finAlmuerzoTime: '13:43' }), TIPOS)
        ?.nombre
    ).toBe('Tardia leve')
  })

  it('empezar antes no regala tiempo: volver a la hora del horario puede ser tarde', () => {
    expect(
      lunchTardinessOfDay(day({ inicioAlmuerzoTime: '11:30', finAlmuerzoTime: '13:00' }), TIPOS)
        ?.nombre
    ).toBe('Tardia grave')
  })

  it('se puede almorzar a cualquier hora del dia', () => {
    expect(
      lunchTardinessOfDay(day({ inicioAlmuerzoTime: '15:10', finAlmuerzoTime: '16:10' }), TIPOS)
    ).toBeNull()
  })

  it('sin marcar el inicio o el regreso no hay tardanza', () => {
    expect(
      lunchTardinessOfDay(day({ inicioAlmuerzoTime: null, finAlmuerzoTime: '14:00' }), TIPOS)
    ).toBeNull()
    expect(lunchTardinessOfDay(day({ finAlmuerzoTime: null }), TIPOS)).toBeNull()
  })

  it('un dia libre no tiene tardanza de almuerzo', () => {
    expect(lunchTardinessOfDay(day({ isDayOff: true, finAlmuerzoTime: '14:00' }), TIPOS)).toBeNull()
  })
})

describe('lunchLateMinutes', () => {
  it('mide el regreso contra una hora despues del inicio marcado', () => {
    expect(lunchLateMinutes(day({ inicioAlmuerzoTime: '12:40', finAlmuerzoTime: '13:50' }))).toBe(
      10
    )
    expect(lunchLateMinutes(day({ inicioAlmuerzoTime: '12:40', finAlmuerzoTime: '13:30' }))).toBe(
      -10
    )
  })

  it('es null si falta alguna de las dos marcas', () => {
    expect(lunchLateMinutes(day({ inicioAlmuerzoTime: null }))).toBeNull()
    expect(lunchLateMinutes(day({ finAlmuerzoTime: null }))).toBeNull()
  })
})

describe('lunchCountsTowardWarning', () => {
  it('justificada no suma', () => {
    expect(
      lunchCountsTowardWarning(
        day({ finAlmuerzoTime: '13:05', isJustifiedLunchTardiness: true }),
        TIPOS
      )
    ).toBe(false)
  })

  it('sin justificar suma', () => {
    expect(lunchCountsTowardWarning(day({ finAlmuerzoTime: '13:05' }), TIPOS)).toBe(true)
  })
})

describe('summarizeMonth con el almuerzo', () => {
  it('un mismo dia puede sumar dos tardias: al entrar y al volver', () => {
    const dias = [day({ entradaTime: '08:02', finAlmuerzoTime: '13:04' })]

    expect(summarizeMonth(dias, TIPOS)).toEqual({ tardias: 2, ausencias: 0 })
  })

  it('llegar a tiempo y volver tarde del almuerzo suma una', () => {
    expect(summarizeMonth([day({ finAlmuerzoTime: '13:07' })], TIPOS)).toEqual({
      tardias: 1,
      ausencias: 0,
    })
  })
})

describe('periodExcessMinutes', () => {
  it('cuenta solo lo que se paso', () => {
    expect(periodExcessMinutes('12:00', '13:15', 60)).toBe(15)
  })

  it('tomar menos de lo permitido no es exceso negativo', () => {
    expect(periodExcessMinutes('10:00', '10:05', 10)).toBe(0)
  })
})

describe('tardanza del segundo bloque (SGRH-110)', () => {
  const partido = (overrides: Partial<DayForInfraction> = {}) =>
    day({
      secondBlockExpectedStart: '16:00',
      secondBlockEntradaTime: '16:00',
      isJustifiedSecondBlockTardiness: false,
      ...overrides,
    })

  it('entrar al segundo bloque a su hora no es tardanza', () => {
    expect(secondBlockLateMinutes(partido())).toBe(0)
    expect(secondBlockTardinessOfDay(partido(), TIPOS)).toBeNull()
  })

  it('se mide contra la hora del segundo bloque, no contra la primera entrada', () => {
    // Entro a las 08:00 (a tiempo) y volvio a las 16:12: 12 min tarde en la tarde.
    const d = partido({ secondBlockEntradaTime: '16:12' })

    expect(secondBlockLateMinutes(d)).toBe(12)
    expect(secondBlockTardinessOfDay(d, TIPOS)?.nombre).toBe('Tardia grave')
  })

  it('usa el mismo catalogo que la entrada', () => {
    expect(
      secondBlockTardinessOfDay(partido({ secondBlockEntradaTime: '16:03' }), TIPOS)?.nombre
    ).toBe('Tardia leve')
  })

  it('un dia de un solo bloque no tiene tardanza de segundo bloque', () => {
    expect(secondBlockTardinessOfDay(day(), TIPOS)).toBeNull()
    expect(secondBlockLateMinutes(day())).toBeNull()
  })

  it('sin marcar la entrada del segundo bloque no hay con que medir', () => {
    expect(secondBlockTardinessOfDay(partido({ secondBlockEntradaTime: null }), TIPOS)).toBeNull()
  })

  it('un dia libre, un feriado o una ausencia aprobada no tienen tardanza', () => {
    const tarde = { secondBlockEntradaTime: '16:30' }
    expect(secondBlockTardinessOfDay(partido({ ...tarde, isDayOff: true }), TIPOS)).toBeNull()
    expect(secondBlockTardinessOfDay(partido({ ...tarde, isHoliday: true }), TIPOS)).toBeNull()
    expect(
      secondBlockTardinessOfDay(partido({ ...tarde, isJustifiedAbsence: true }), TIPOS)
    ).toBeNull()
  })

  it('justificada, deja de contar para el mes', () => {
    const tarde = partido({ secondBlockEntradaTime: '16:30' })

    expect(secondBlockCountsTowardWarning(tarde, TIPOS)).toBe(true)
    expect(
      secondBlockCountsTowardWarning({ ...tarde, isJustifiedSecondBlockTardiness: true }, TIPOS)
    ).toBe(false)
  })

  it('un tipo configurado para no contar no suma', () => {
    const sinContar = TIPOS.map((t) => ({ ...t, cuentaAdvertencia: false }))

    expect(
      secondBlockCountsTowardWarning(partido({ secondBlockEntradaTime: '16:30' }), sinContar)
    ).toBe(false)
  })

  it('suma al mes junto con la entrada y el almuerzo del mismo dia', () => {
    const tresTardias = partido({
      entradaTime: '08:20',
      finAlmuerzoTime: '13:20',
      secondBlockEntradaTime: '16:20',
    })

    expect(summarizeMonth([tresTardias], TIPOS)).toEqual({ tardias: 3, ausencias: 0 })
  })

  it('llegar tarde solo al segundo bloque cuenta una tardia, sin volver al dia "tardio"', () => {
    expect(summarizeMonth([partido({ secondBlockEntradaTime: '16:20' })], TIPOS)).toEqual({
      tardias: 1,
      ausencias: 0,
    })
  })
})
