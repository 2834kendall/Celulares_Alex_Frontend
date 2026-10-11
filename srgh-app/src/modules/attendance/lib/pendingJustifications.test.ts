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
