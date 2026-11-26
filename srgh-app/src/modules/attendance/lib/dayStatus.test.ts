import { describe, expect, it } from 'vitest'
import type { DailyAttendanceRow } from '@/modules/attendance/actions/getDailyAttendance'
import type { TardinessType } from '@/modules/attendance/lib/infractions'
import { attendanceStatusOf, type DayClock } from './dayStatus'

const MARK = { id: 1, time: '08:00', diffMinutes: 0 } as DailyAttendanceRow['entrada']

function row(overrides: Partial<DailyAttendanceRow>): DailyAttendanceRow {
  return {
    employmentHistoryId: 1,
    employeeId: 1,
    fullName: 'Persona 1',
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
    blocks: [],
    scheduledBlocks: [],
    isSecondBlockJustified: false,
    duplicateMarksCount: 0,
    isOpen: false,
    tardiness: null,
    lunchTardiness: null,
    secondBlockTardiness: null,
    lunchExcessMinutes: null,
    breakExcessMinutes: null,
    ...overrides,
  } as DailyAttendanceRow
}

function late(minutes: number, isJustified = false): DailyAttendanceRow['tardiness'] {
  return {
    tipo: { nombre: 'Tardía leve', color: '#f59e0b' },
    diffMinutes: minutes,
    isJustified,
    justification: null,
  } as DailyAttendanceRow['tardiness']
}

const TIPOS: TardinessType[] = [
  { id: 1, nombre: 'Tardía leve', desdeMinutos: 5, cuentaAdvertencia: false, color: '#f59e0b' },
  { id: 2, nombre: 'Tardía grave', desdeMinutos: 20, cuentaAdvertencia: true, color: '#e11d48' },
]

const at = (nowTime: string): DayClock => ({ when: 'today', nowTime })
const PAST: DayClock = { when: 'past' }
const FUTURE: DayClock = { when: 'future' }

describe('attendanceStatusOf', () => {
  it('leaves days off, holidays and unscheduled people out', () => {
    expect(attendanceStatusOf(row({ isDayOff: true }), at('09:00'), TIPOS).kind).toBe('libre')
    expect(attendanceStatusOf(row({ isHoliday: true }), at('09:00'), TIPOS).kind).toBe('libre')
    expect(attendanceStatusOf(row({ expectedStart: null }), at('09:00'), TIPOS).kind).toBe(
      'sin_programacion'
    )
  })

  it('reports an approved absence as justified, with nothing to do', () => {
    const status = attendanceStatusOf(row({ ausencia: 'Vacaciones' }), PAST, TIPOS)
    expect(status).toEqual({ kind: 'justificada', tardiness: null, needsAttention: false })
  })

  it('keeps someone inside the tolerance as on their way', () => {
    const status = attendanceStatusOf(row({}), at('08:04'), TIPOS)
    expect(status).toEqual({ kind: 'por_llegar', tardiness: null, needsAttention: false })
  })

  it('flags someone past the first tardiness minute, with the type they fall in', () => {
    const status = attendanceStatusOf(row({}), at('08:25'), TIPOS)
    expect(status.kind).toBe('sin_marcar')
    expect(status.needsAttention).toBe(true)
    expect(status.tardiness).toMatchObject({ nombre: 'Tardía grave', minutes: 25 })
  })

  it('treats a missing entry as missed on a past day and as pending on a future one', () => {
    expect(attendanceStatusOf(row({}), PAST, TIPOS)).toEqual({
      kind: 'sin_marcar',
      tardiness: null,
      needsAttention: true,
    })
    expect(attendanceStatusOf(row({}), FUTURE, TIPOS).kind).toBe('por_llegar')
  })

  it('tells working today from a forgotten exit on a past day', () => {
    expect(attendanceStatusOf(row({ entrada: MARK }), at('10:00'), TIPOS)).toEqual({
      kind: 'en_jornada',
      tardiness: null,
      needsAttention: false,
    })
    expect(attendanceStatusOf(row({ entrada: MARK }), PAST, TIPOS)).toEqual({
      kind: 'sin_salida',
      tardiness: null,
      needsAttention: true,
    })
  })

  it('reports someone who clocked out as gone', () => {
    const status = attendanceStatusOf(row({ entrada: MARK, salida: MARK }), PAST, TIPOS)
    expect(status).toEqual({ kind: 'ya_salio', tardiness: null, needsAttention: false })
  })

  describe('split shift', () => {
    const OUT = { id: 2, time: '12:00', diffMinutes: null } as DailyAttendanceRow['salida']
    const blocks = (second: { entrada?: boolean; salida?: boolean } = {}) =>
      [
        {
          inicio: '08:00',
          fin: '12:00',
          branchId: 1,
          branchName: null,
          entrada: MARK,
          salida: OUT,
        },
        {
          inicio: '18:00',
          fin: '23:00',
          branchId: 1,
          branchName: null,
          entrada: second.entrada ? MARK : null,
          salida: second.salida ? OUT : null,
        },
      ] as DailyAttendanceRow['scheduledBlocks']
    const split = (overrides: Partial<DailyAttendanceRow> = {}) =>
      row({ entrada: MARK, salida: OUT, scheduledBlocks: blocks(), ...overrides })

    it('does not treat the first block exit as the end of the day', () => {
      expect(attendanceStatusOf(split(), at('13:00'), TIPOS).kind).toBe('por_llegar')
    })

    it('flags a missing second block once its tolerance passes, and on a past day', () => {
      const late = attendanceStatusOf(split(), at('18:30'), TIPOS)
      expect(late.kind).toBe('sin_marcar')
      expect(late.needsAttention).toBe(true)
      expect(late.tardiness).toMatchObject({ nombre: 'Tardía grave', minutes: 30 })
      expect(attendanceStatusOf(split(), PAST, TIPOS)).toMatchObject({
        kind: 'sin_marcar',
        needsAttention: true,
      })
    })

    it('stops asking once the second block is justified or covered by an absence', () => {
      expect(attendanceStatusOf(split({ isSecondBlockJustified: true }), PAST, TIPOS).kind).toBe(
        'ya_salio'
      )
      expect(attendanceStatusOf(split({ ausencia: 'Permiso' }), PAST, TIPOS).kind).toBe('ya_salio')
    })

    it('follows the second block once it is marked', () => {
      const working = split({ scheduledBlocks: blocks({ entrada: true }) })
      expect(attendanceStatusOf(working, at('19:00'), TIPOS).kind).toBe('en_jornada')
      expect(attendanceStatusOf(working, PAST, TIPOS).kind).toBe('sin_salida')
      const done = split({ scheduledBlocks: blocks({ entrada: true, salida: true }) })
      expect(attendanceStatusOf(done, PAST, TIPOS).kind).toBe('ya_salio')
    })
  })

  it('carries the tardiness Attendance already gave, and only an unjustified one needs action', () => {
    const lateRow = row({ entrada: MARK, tardiness: late(12) })
    expect(attendanceStatusOf(lateRow, at('10:00'), TIPOS)).toEqual({
      kind: 'en_jornada',
      tardiness: { nombre: 'Tardía leve', color: '#f59e0b', minutes: 12, isJustified: false },
      needsAttention: true,
    })

    const justified = row({ entrada: MARK, tardiness: late(12, true) })
    expect(attendanceStatusOf(justified, at('10:00'), TIPOS).needsAttention).toBe(false)
  })
})
