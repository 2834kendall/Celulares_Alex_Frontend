import { describe, expect, it } from 'vitest'
import { buildJustificationQueue } from './pendingJustifications'
import type {
  MonthlyEmployeeSummary,
  TardyDay,
} from '@/modules/attendance/actions/getMonthlyAttendanceSummary'

function tardy(overrides: Partial<TardyDay> = {}): TardyDay {
  return {
    date: '2026-07-10',
    kind: 'entrada',
    time: '08:15',
    diffMinutes: 15,
    tipo: { nombre: 'Tardia grave', color: null },
    countsTowardWarning: true,
    markId: 77,
    isJustified: false,
    justification: null,
    ...overrides,
  }
}

function row(overrides: Partial<MonthlyEmployeeSummary>): MonthlyEmployeeSummary {
  return {
    employeeId: 10,
    employmentHistoryId: 1,
    fullName: 'Ana Perez',
    tardias: 0,
    ausencias: 0,
    tardyDays: [],
    absentDays: [],
    absentSecondBlockDays: [],
    justifiedAbsences: [],
    ...overrides,
  }
}

describe('buildJustificationQueue', () => {
  it('separa pendientes de resueltas', () => {
    const { pending, resolved } = buildJustificationQueue([
      row({
        tardyDays: [tardy(), tardy({ date: '2026-07-02', isJustified: true })],
        absentDays: ['2026-07-05'],
        justifiedAbsences: [{ date: '2026-07-08', tipoNombre: 'Cita Médica' }],
      }),
    ])

    expect(pending.map((i) => [i.kind, i.date])).toEqual([
      ['tardia', '2026-07-10'],
      ['ausencia', '2026-07-05'],
    ])
    expect(resolved.map((i) => [i.kind, i.date])).toEqual([
      ['ausencia_justificada', '2026-07-08'],
      ['tardia', '2026-07-02'],
    ])
  })

  it('ordena por fecha descendente, luego por nombre, y la entrada antes que el almuerzo', () => {
    const { pending } = buildJustificationQueue([
      row({
        fullName: 'Bruno Mora',
        employmentHistoryId: 2,
        tardyDays: [
          tardy({ kind: 'almuerzo', markId: 80 }),
          tardy({ kind: 'entrada', markId: 79 }),
        ],
      }),
      row({ tardyDays: [tardy()], absentDays: ['2026-07-11'] }),
    ])

    expect(pending.map((i) => [i.date, i.employeeName, i.kind === 'tardia' && i.day.kind])).toEqual(
      [
        ['2026-07-11', 'Ana Perez', false],
        ['2026-07-10', 'Ana Perez', 'entrada'],
        ['2026-07-10', 'Bruno Mora', 'entrada'],
        ['2026-07-10', 'Bruno Mora', 'almuerzo'],
      ]
    )
  })

  it('deja fuera una tardia sin marca detras', () => {
    const { pending } = buildJustificationQueue([row({ tardyDays: [tardy({ markId: null })] })])

    expect(pending).toEqual([])
  })
})

describe('tardia del segundo bloque en la bandeja (SGRH-110)', () => {
  it('va despues de la entrada y del almuerzo del mismo dia, y se puede justificar', () => {
    const queue = buildJustificationQueue([
      row({
        tardyDays: [
          tardy({ kind: 'segundo_bloque', time: '16:12', markId: 3 }),
          tardy({ kind: 'almuerzo', time: '13:10', markId: 2 }),
          tardy({ kind: 'entrada', time: '08:15', markId: 1 }),
        ],
      }),
    ])

    expect(queue.pending.map((i) => (i.kind === 'tardia' ? i.day.kind : i.kind))).toEqual([
      'entrada',
      'almuerzo',
      'segundo_bloque',
    ])
  })
})

describe('ausencia del segundo bloque en la bandeja (SGRH-110)', () => {
  it('entra como pendiente y se distingue de no haber venido', () => {
    const queue = buildJustificationQueue([
      row({ absentDays: ['2026-07-05'], absentSecondBlockDays: ['2026-07-09'] }),
    ])

    expect(queue.pending).toEqual([
      expect.objectContaining({ kind: 'ausencia', date: '2026-07-09', bloque: 'segundo' }),
      expect.objectContaining({ kind: 'ausencia', date: '2026-07-05' }),
    ])
    expect(queue.pending[1]).not.toHaveProperty('bloque')
  })
})
