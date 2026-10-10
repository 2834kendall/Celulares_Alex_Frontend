import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TARDINESS_TYPES,
  lunchCountsTowardWarning,
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
