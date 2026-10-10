import { describe, expect, it } from 'vitest'
import {
  describeMyDay,
  expiryLabel,
  rangeLabel,
  startsInLabel,
  summarizeAbsences,
  summarizeEvaluations,
  summarizeMyAbsences,
  summarizeMyEvaluations,
  summarizeWeekSchedule,
  toExpiringContracts,
  type RosterPerson,
} from './extras'

function person(labId: number, overrides: Partial<RosterPerson> = {}): RosterPerson {
  return {
    labId,
    employeeId: labId + 100,
    nombre: `Persona ${labId}`,
    puesto: null,
    sucursal: null,
    fechaFinProgramada: null,
    ...overrides,
  }
}

const roster = (...people: RosterPerson[]) => new Map(people.map((p) => [p.labId, p]))

describe('rangeLabel', () => {
  it('collapses a single day and a range inside one month', () => {
    expect(rangeLabel('2026-10-07', '2026-10-07')).toBe('7 oct')
    expect(rangeLabel('2026-10-07', '2026-10-09')).toBe('7–9 oct')
    expect(rangeLabel('2026-09-30', '2026-10-02')).toBe('30 sep – 2 oct')
  })
})

describe('summarizeAbsences', () => {
  const absence = (id: number, labId: number, from: string, to: string, esIntradia = false) => ({
    id,
    labId,
    fechaInicio: from,
    fechaFin: to,
    tipo: 'Vacaciones',
    esIntradia,
  })

  it('puts the ones in force today first and counts who is out', () => {
    const summary = summarizeAbsences(
      [absence(1, 1, '2026-10-09', '2026-10-09'), absence(2, 2, '2026-10-05', '2026-10-08')],
      roster(person(1), person(2)),
      '2026-10-07'
    )

    expect(summary.absences.map((a) => [a.id, a.coversToday])).toEqual([
      [2, true],
      [1, false],
    ])
    expect(summary.outToday).toBe(1)
  })

  it('does not count as out someone on a part-day absence', () => {
    const summary = summarizeAbsences(
      [absence(1, 1, '2026-10-01', '2026-10-31', true)],
      roster(person(1)),
      '2026-10-07'
    )

    expect(summary.outToday).toBe(0)
    expect(summary.absences[0]).toMatchObject({ coversToday: true, esIntradia: true })
  })

  it('counts a person once even with two absences today, and drops unknown contracts', () => {
    const summary = summarizeAbsences(
      [
        absence(1, 1, '2026-10-07', '2026-10-07'),
        absence(2, 1, '2026-10-06', '2026-10-08'),
        absence(3, 99, '2026-10-07', '2026-10-07'),
      ],
      roster(person(1)),
      '2026-10-07'
    )

    expect(summary.outToday).toBe(1)
    expect(summary.absences).toHaveLength(2)
  })
})

describe('summarizeEvaluations', () => {
  const evaluation = (
    id: number,
    labId: number | null,
    fecha: string,
    promedio: number | null
  ) => ({
    id,
    labId,
    fecha,
    promedio,
  })

  it('averages each person latest score and says who is still missing', () => {
    const summary = summarizeEvaluations(
      [
        evaluation(3, 1, '2026-09-01', 9),
        evaluation(2, 2, '2026-06-01', 6),
        evaluation(1, 1, '2026-03-01', 4),
      ],
      roster(person(1), person(2), person(3)),
      2026
    )

    expect(summary).toMatchObject({ evaluated: 2, pending: 1, average: 7.5, year: 2026 })
    expect(summary.pendingNames).toEqual(['Persona 3'])
    expect(summary.recent.map((e) => e.id)).toEqual([3, 2, 1])
  })

  it('has no average when nobody was evaluated', () => {
    const summary = summarizeEvaluations([], roster(person(1)), 2026)

    expect(summary).toMatchObject({ evaluated: 0, pending: 1, average: null })
  })

  it('ignores evaluations of people no longer on the roster', () => {
    const summary = summarizeEvaluations(
      [evaluation(1, 99, '2026-05-01', 10), evaluation(2, null, '2026-05-01', 10)],
      roster(person(1)),
      2026
    )

    expect(summary.evaluated).toBe(0)
    expect(summary.recent).toEqual([])
  })
})

describe('toExpiringContracts', () => {
  it('keeps the ones inside the window, overdue first', () => {
    const contracts = toExpiringContracts(
      [
        person(1, { fechaFinProgramada: '2026-10-20' }),
        person(2, { fechaFinProgramada: '2026-10-01' }),
        person(3, { fechaFinProgramada: '2027-03-01' }),
        person(4),
      ],
      '2026-10-07',
      60
    )

    expect(contracts.map((c) => [c.labId, c.daysLeft])).toEqual([
      [2, -6],
      [1, 13],
    ])
    expect(contracts[1].dateLabel).toBe('20 oct')
  })
})

describe('expiryLabel', () => {
  it('reads naturally on both sides of today', () => {
    expect(expiryLabel(0)).toBe('Vence hoy')
    expect(expiryLabel(1)).toBe('Vence mañana')
    expect(expiryLabel(12)).toBe('en 12 días')
    expect(expiryLabel(-1)).toBe('Venció ayer')
    expect(expiryLabel(-3)).toBe('Venció hace 3 días')
  })
})

describe('describeMyDay', () => {
  const day = {
    date: '2026-10-07',
    entrada: null,
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
  }
  const at = (time: string) => ({ time })

  it('follows the shift from no marks to done', () => {
    expect(describeMyDay(null).status).toBe('none')
    expect(describeMyDay({ ...day, entrada: at('08:00') }).status).toBe('working')
    expect(describeMyDay({ ...day, entrada: at('08:00'), inicioReceso: at('10:00') }).status).toBe(
      'break'
    )
    expect(
      describeMyDay({
        ...day,
        entrada: at('08:00'),
        inicioReceso: at('10:00'),
        finReceso: at('10:15'),
        inicioAlmuerzo: at('12:00'),
      }).status
    ).toBe('lunch')
    expect(describeMyDay({ ...day, entrada: at('08:00'), salida: at('17:00') }).status).toBe('done')
  })

  it('lists the six steps in order, with the time of the ones made', () => {
    const { steps } = describeMyDay({ ...day, entrada: at('08:03') })

    expect(steps).toHaveLength(6)
    expect(steps[0]).toMatchObject({ label: 'Entrada', time: '08:03' })
    expect(steps[5]).toMatchObject({ label: 'Salida', time: null })
  })
})

describe('summarizeMyAbsences', () => {
  const mine = (id: number, from: string, to: string, estado = 'aprobada') => ({
    id,
    fechaInicio: from,
    fechaFin: to,
    tipo: 'Vacaciones',
    esIntradia: false,
    estado,
  })

  it('orders in force, then coming, then gone, and counts what awaits an answer', () => {
    const summary = summarizeMyAbsences(
      [
        mine(1, '2026-09-20', '2026-09-22'),
        mine(2, '2026-10-20', '2026-10-24', 'pendiente'),
        mine(3, '2026-10-06', '2026-10-08'),
        mine(4, '2026-10-12', '2026-10-12', 'rechazada'),
        mine(5, '2026-09-28', '2026-09-29', 'pendiente'),
      ],
      '2026-10-07'
    )

    expect(summary.absences.map((a) => a.id)).toEqual([3, 4, 2, 5, 1])
    expect(summary.absences[0]).toMatchObject({ isNow: true, startsIn: -1 })
    /* The request whose dates already went by no longer awaits anything. */
    expect(summary.pending).toBe(1)
  })

  it('is not "now" while the request covering today is not approved', () => {
    const summary = summarizeMyAbsences(
      [mine(1, '2026-10-07', '2026-10-07', 'pendiente')],
      '2026-10-07'
    )
    expect(summary.absences[0].isNow).toBe(false)
  })

  it('drops rows in a state the app does not know', () => {
    expect(
      summarizeMyAbsences([mine(1, '2026-10-09', '2026-10-09', 'anulada')], '2026-10-07')
    ).toEqual({
      pending: 0,
      absences: [],
    })
  })
})

describe('startsInLabel', () => {
  it('only speaks about what has not started', () => {
    expect([startsInLabel(-2), startsInLabel(0), startsInLabel(1), startsInLabel(9)]).toEqual([
      '',
      '',
      'Mañana',
      'en 9 días',
    ])
  })
})

describe('summarizeWeekSchedule', () => {
  const week = [
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
  ]
  const shift = (labId: number, fecha: string, esDiaLibre = false) => ({ labId, fecha, esDiaLibre })

  it('counts who works and who rests each day, and marks today', () => {
    const summary = summarizeWeekSchedule(
      [
        shift(1, '2026-10-07'),
        shift(2, '2026-10-07'),
        shift(3, '2026-10-07', true),
        shift(1, '2026-10-08', true),
      ],
      roster(person(1), person(2), person(3)),
      week,
      '2026-10-07'
    )

    expect(summary.days[2]).toMatchObject({ label: 'MI', working: 2, off: 1, isToday: true })
    expect(summary.days[3]).toMatchObject({ name: 'jueves', working: 0, off: 1, isToday: false })
    expect(summary.unassigned).toBe(0)
  })

  it('names who has nothing scheduled in the whole week', () => {
    const summary = summarizeWeekSchedule(
      [shift(2, '2026-10-06')],
      roster(person(1), person(2), person(3)),
      week,
      '2026-10-07'
    )

    expect(summary.unassigned).toBe(2)
    expect(summary.unassignedNames).toEqual(['Persona 1', 'Persona 3'])
  })

  it('counts a person once a day and ignores contracts off the roster', () => {
    const summary = summarizeWeekSchedule(
      [shift(1, '2026-10-05'), shift(1, '2026-10-05'), shift(9, '2026-10-05')],
      roster(person(1)),
      week,
      '2026-10-07'
    )

    expect(summary.days[0].working).toBe(1)
  })
})

describe('summarizeMyEvaluations', () => {
  const evaluation = (id: number, fecha: string, promedio: number | null) => ({
    id,
    fecha,
    promedio,
    periodo: 'periodo_prueba',
  })

  it('orders them oldest first and compares the last two', () => {
    const summary = summarizeMyEvaluations([
      evaluation(3, '2026-09-15', 9.1),
      evaluation(1, '2026-03-14', 7.8),
      evaluation(2, '2026-06-11', 8.6),
    ])

    expect(summary.evaluations.map((e) => e.id)).toEqual([1, 2, 3])
    expect(summary.evaluations[2]).toMatchObject({
      fecha: '15 sep 2026',
      fechaCorta: 'sep 26',
      periodo: 'Periodo prueba',
    })
    expect(summary.delta).toBe(0.5)
  })

  it('skips the ones without a score and has no delta with a single one', () => {
    const summary = summarizeMyEvaluations([
      evaluation(1, '2026-03-14', null),
      evaluation(2, '2026-06-11', 8),
    ])

    expect(summary.evaluations).toHaveLength(1)
    expect(summary.delta).toBeNull()
  })
})
