import { describe, expect, it } from 'vitest'
import type { DailyAttendanceRow } from '@/modules/attendance/actions/getDailyAttendance'
import type { TardinessType } from '@/modules/attendance/lib/infractions'
import type { PeriodoListItem } from '@/modules/payroll/types'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import type { MonthlyEmployeeSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import {
  summarizeAttendance,
  summarizeMonth,
  summarizePayroll,
  summarizeRecruitment,
} from './summaries'

const MARK = { id: 1, time: '08:00', diffMinutes: 0 } as DailyAttendanceRow['entrada']

function row(id: number, overrides: Partial<DailyAttendanceRow>): DailyAttendanceRow {
  return {
    employmentHistoryId: id,
    employeeId: id,
    fullName: `Persona ${id}`,
    fotoUrl: null,
    position: null,
    branchId: 1,
    isDayOff: false,
    isHoliday: false,
    ausencia: null,
    expectedStart: '08:00',
    entrada: null,
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    duplicateMarksCount: 0,
    isOpen: false,
    tardiness: null,
    lunchTardiness: null,
    lunchExcessMinutes: null,
    breakExcessMinutes: null,
    ...overrides,
  } as DailyAttendanceRow
}

function late(minutes: number) {
  return {
    tipo: { nombre: 'Tardía', color: '#f00' },
    diffMinutes: minutes,
    isJustified: false,
    justification: null,
  } as DailyAttendanceRow['tardiness']
}

/* Same shape as the company catalog: tardiness starts at the first type. */
const TIPOS: TardinessType[] = [
  { id: 1, nombre: 'Tardía leve', desdeMinutos: 5, cuentaAdvertencia: false, color: '#f59e0b' },
  { id: 2, nombre: 'Tardía grave', desdeMinutos: 20, cuentaAdvertencia: true, color: '#e11d48' },
]

describe('summarizeAttendance', () => {
  it('splits the people expected today by what happened to them', () => {
    const summary = summarizeAttendance(
      [
        row(1, { entrada: MARK }),
        row(2, { entrada: MARK, salida: MARK }),
        row(3, { entrada: MARK, tardiness: late(12) }),
        row(4, { ausencia: 'Incapacidad' }),
        row(5, {}),
      ],
      '10:00',
      TIPOS
    )

    expect(summary).toMatchObject({
      expected: 5,
      onTime: 2,
      late: 1,
      justified: 1,
      missing: 1,
      pending: 0,
      working: 2,
      left: 1,
    })
    expect(summary.missingPeople.map((person) => person.id)).toEqual([5])
  })

  it('does not report as missing someone whose shift has not started', () => {
    const summary = summarizeAttendance([row(1, { expectedStart: '13:00' })], '08:30', TIPOS)

    expect(summary).toMatchObject({ expected: 1, missing: 0, pending: 1 })
    expect(summary.pendingPeople[0]).toMatchObject({ id: 1, expectedStart: '13:00' })
  })

  it('keeps as pending whoever is still inside the tolerance of the catalog', () => {
    /* 4 minutes past 08:00, and tardiness only starts at minute 5. */
    const summary = summarizeAttendance([row(1, {})], '08:04', TIPOS)

    expect(summary).toMatchObject({ missing: 0, pending: 1 })
  })

  it('classifies whoever has not arrived with the configured types, by the clock', () => {
    const summary = summarizeAttendance([row(1, {})], '08:08', TIPOS)
    expect(summary.missingPeople[0]).toMatchObject({ minutes: 8, tipo: { nombre: 'Tardía leve' } })

    const later = summarizeAttendance([row(1, {})], '08:45', TIPOS)
    expect(later.missingPeople[0]).toMatchObject({ minutes: 45, tipo: { nombre: 'Tardía grave' } })
  })

  it('follows the catalog when its thresholds change', () => {
    const strict: TardinessType[] = [
      { id: 9, nombre: 'Tardía', desdeMinutos: 1, cuentaAdvertencia: true, color: null },
    ]

    expect(summarizeAttendance([row(1, {})], '08:02', TIPOS).missing).toBe(0)
    expect(summarizeAttendance([row(1, {})], '08:02', strict).missing).toBe(1)
  })

  it('leaves out days off, holidays and people with nothing scheduled', () => {
    const summary = summarizeAttendance(
      [row(1, { isDayOff: true }), row(2, { isHoliday: true }), row(3, { expectedStart: null })],
      '10:00',
      TIPOS
    )

    expect(summary.expected).toBe(0)
    expect(summary.missing).toBe(0)
  })

  it('lists who was late with the type Attendance gave them, the latest first', () => {
    const summary = summarizeAttendance(
      [
        row(1, { entrada: MARK, tardiness: late(5) }),
        row(2, { entrada: MARK, tardiness: late(40) }),
      ],
      '10:00',
      TIPOS
    )

    expect(summary.latePeople.map((person) => [person.id, person.minutes])).toEqual([
      [2, 40],
      [1, 5],
    ])
    expect(summary.latePeople[0].tipo.nombre).toBe('Tardía')
  })
})

function periodo(id: number, overrides: Partial<PeriodoListItem>): PeriodoListItem {
  return {
    id,
    mes: 10,
    anio: 2026,
    quincena: 1,
    fechaInicio: '2026-10-01',
    fechaFin: '2026-10-15',
    estado: 'borrador',
    atrasado: false,
    fechaPago: null,
    sucursalNombre: 'San José',
    totalEmpleados: 12,
    ...overrides,
  }
}

describe('summarizePayroll', () => {
  it('picks the period today falls in and says which day of it today is', () => {
    const summary = summarizePayroll(
      [
        periodo(2, {}),
        periodo(1, {
          mes: 9,
          quincena: 2,
          fechaInicio: '2026-09-16',
          fechaFin: '2026-09-30',
          atrasado: true,
        }),
      ],
      '2026-10-06'
    )

    expect(summary.current).toMatchObject({ id: 2, day: 6, totalDays: 15 })
    expect(summary).toMatchObject({ pending: 2, overdue: 1 })
    expect(summary.others.map((other) => other.id)).toEqual([1])
  })

  it('falls back to the latest unpaid period, without a day count', () => {
    const summary = summarizePayroll(
      [periodo(1, { fechaInicio: '2026-09-01', fechaFin: '2026-09-15', atrasado: true })],
      '2026-10-06'
    )

    expect(summary.current).toMatchObject({ id: 1, day: null, totalDays: null })
  })

  it('has no current period when everything is paid and none is running', () => {
    const summary = summarizePayroll(
      [periodo(1, { estado: 'pagado', fechaInicio: '2026-09-01', fechaFin: '2026-09-15' })],
      '2026-10-06'
    )

    expect(summary).toEqual({ pending: 0, overdue: 0, current: null, others: [] })
  })
})

function postulacion(id: number, fase: 1 | 2 | 3, fecha: string): PostulacionBoardItem {
  return {
    posId: id,
    candidatoId: id,
    candidatoNombre: `Candidato ${id}`,
    puestoNombre: 'Cajero',
    sucursalNombre: null,
    fechaPostula: fecha,
    puntajePromedio: null,
    etapaFase: fase,
    etapaNombre: null,
    etapaColor: null,
  } as PostulacionBoardItem
}

describe('summarizeRecruitment', () => {
  it('counts per phase, keeping the empty ones, and lists the newest first', () => {
    const summary = summarizeRecruitment([
      postulacion(1, 1, '2026-09-01'),
      postulacion(2, 1, '2026-10-02'),
      postulacion(3, 3, '2026-09-20'),
    ])

    expect(summary.total).toBe(3)
    expect(summary.phases.map((phase) => phase.count)).toEqual([2, 0, 1])
    expect(summary.newest.map((item) => item.id)).toEqual([2, 3, 1])
  })
})

describe('summarizeMonth', () => {
  function monthRow(id: number, tardias: number, ausencias: number) {
    return {
      employeeId: id,
      employmentHistoryId: id,
      fullName: `Persona ${id}`,
      tardias,
      ausencias,
      tardyDays: [],
      absentDays: [],
      justifiedAbsences: [],
    } as unknown as MonthlyEmployeeSummary
  }

  it('totals everyone and ranks who accumulates the most, leaving out the clean ones', () => {
    const summary = summarizeMonth([monthRow(1, 1, 0), monthRow(2, 0, 0), monthRow(3, 2, 3)])

    expect(summary).toMatchObject({ tardias: 3, ausencias: 3 })
    expect(summary.people.map((person) => person.id)).toEqual([3, 1])
  })

  it('is empty when the month is clean', () => {
    expect(summarizeMonth([monthRow(1, 0, 0)])).toEqual({ tardias: 0, ausencias: 0, people: [] })
  })
})
