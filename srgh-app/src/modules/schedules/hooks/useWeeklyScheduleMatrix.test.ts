import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeeklyScheduleMatrix } from './useWeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import type { EmployeeWeekRow, DayAssignment } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

vi.mock('@/modules/schedules/actions/assignDaySchedule', () => ({
  assignDaySchedule: vi.fn(),
}))

const mockAssignDaySchedule = vi.mocked(assignDaySchedule)

function makeAssignment(overrides: Partial<DayAssignment> = {}): DayAssignment {
  return {
    date: '2026-01-05',
    assignmentId: null,
    scheduleId: null,
    scheduleName: null,
    startTime: null,
    endTime: null,
    isDayOff: false,
    hours: 0,
    ...overrides,
  }
}

function makeRow(overrides: Partial<EmployeeWeekRow> = {}): EmployeeWeekRow {
  return {
    employmentHistoryId: 1,
    employeeId: 10,
    branchId: 100,
    fullName: 'Ana Perez',
    position: 'Cajera',
    days: [makeAssignment()],
    weeklyTotal: 0,
    ...overrides,
  }
}

const activeSchedule: ScheduleRow = {
  hor_id: 1,
  hor_activo: true,
} as ScheduleRow

const inactiveSchedule: ScheduleRow = {
  hor_id: 2,
  hor_activo: false,
} as ScheduleRow

describe('useWeeklyScheduleMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAssignmentValue', () => {
    it('devuelve "__free__" cuando el dia es descanso', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [], canWrite: true })
      )
      expect(result.current.getAssignmentValue(makeAssignment({ isDayOff: true }))).toBe('__free__')
    })

    it('devuelve "__custom__" cuando tiene horas personalizadas', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [], canWrite: true })
      )
      expect(result.current.getAssignmentValue(makeAssignment({ customStartTime: '08:00' }))).toBe(
        '__custom__'
      )
    })

    it('devuelve el scheduleId como string cuando hay uno asignado', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [], canWrite: true })
      )
      expect(result.current.getAssignmentValue(makeAssignment({ scheduleId: 4 }))).toBe('4')
    })

    it('devuelve string vacio cuando no hay nada asignado', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [], canWrite: true })
      )
      expect(result.current.getAssignmentValue(makeAssignment())).toBe('')
    })
  })

  describe('scheduleOptions', () => {
    it('filtra solo los horarios activos cuando hay al menos uno', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({
          rows: [],
          schedules: [activeSchedule, inactiveSchedule],
          canWrite: true,
        })
      )
      expect(result.current.scheduleOptions).toEqual([activeSchedule])
    })

    it('cae de vuelta a todos los horarios si ninguno esta activo', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [inactiveSchedule], canWrite: true })
      )
      expect(result.current.scheduleOptions).toEqual([inactiveSchedule])
    })
  })

  describe('modal de horas personalizadas', () => {
    it('openCustomModal / closeCustomModal controlan customModalFor', () => {
      const row = makeRow()
      const assignment = row.days[0]
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      act(() => result.current.openCustomModal(row, assignment))
      expect(result.current.customModalFor).toEqual({ row, assignment })

      act(() => result.current.closeCustomModal())
      expect(result.current.customModalFor).toBeNull()
    })
  })

  describe('handleAssignmentChange', () => {
    it('no hace nada si canWrite es false', async () => {
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: false })
      )

      await act(() => result.current.handleAssignmentChange(row, row.days[0], '__free__'))

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('abre el modal personalizado cuando se elige "__custom__" en vez de guardar', async () => {
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      await act(() => result.current.handleAssignmentChange(row, row.days[0], '__custom__'))

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      expect(result.current.customModalFor).toEqual({ row, assignment: row.days[0] })
    })

    it('no llama a la action cuando el valor esta vacio (sin seleccion)', async () => {
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      await act(() => result.current.handleAssignmentChange(row, row.days[0], ''))

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('marca el dia como libre cuando se elige "__free__"', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      await act(() => result.current.handleAssignmentChange(row, row.days[0], '__free__'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ isDayOff: true, scheduleId: null })
      )
      expect(result.current.savingCell).toBeNull()
      expect(result.current.serverError).toBeNull()
    })

    it('asigna un horario existente cuando se elige su id', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      await act(() => result.current.handleAssignmentChange(row, row.days[0], '4'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ isDayOff: false, scheduleId: 4 })
      )
    })

    it('guarda savingCell mientras la peticion esta pendiente', async () => {
      let resolveAssign!: (value: { ok: true }) => void
      mockAssignDaySchedule.mockReturnValue(
        new Promise((resolve) => {
          resolveAssign = resolve
        })
      )
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      act(() => {
        result.current.handleAssignmentChange(row, row.days[0], '__free__')
      })

      await waitFor(() =>
        expect(result.current.savingCell).toBe(`${row.employmentHistoryId}-${row.days[0].date}`)
      )

      await act(async () => resolveAssign({ ok: true }))
      expect(result.current.savingCell).toBeNull()
    })

    it('expone el error del servidor cuando la action falla', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: false, error: 'No se pudo guardar.' })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      await act(() => result.current.handleAssignmentChange(row, row.days[0], '__free__'))

      expect(result.current.serverError).toBe('No se pudo guardar.')
    })
  })

  describe('handleCustomConfirm', () => {
    it('no hace nada si no hay modal abierto', async () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [], canWrite: true })
      )

      await act(() =>
        result.current.handleCustomConfirm({
          startTime: '08:00',
          endTime: '17:00',
          lunchStart: null,
          lunchEnd: null,
          breakStart: null,
          breakEnd: null,
        })
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('guarda las horas personalizadas y cierra el modal en exito', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      act(() => result.current.openCustomModal(row, row.days[0]))

      await act(() =>
        result.current.handleCustomConfirm({
          startTime: '09:00',
          endTime: '18:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          breakStart: null,
          breakEnd: null,
        })
      )

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          customStartTime: '09:00',
          customEndTime: '18:00',
          customLunchStart: '12:00',
          customLunchEnd: '13:00',
          isDayOff: false,
          scheduleId: null,
        })
      )
      expect(result.current.customModalFor).toBeNull()
      expect(result.current.serverError).toBeNull()
    })

    it('mantiene el error del servidor visible si falla, con el modal ya cerrado', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: false, error: 'Horas invalidas.' })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      act(() => result.current.openCustomModal(row, row.days[0]))

      await act(() =>
        result.current.handleCustomConfirm({
          startTime: '09:00',
          endTime: '08:00',
          lunchStart: null,
          lunchEnd: null,
          breakStart: null,
          breakEnd: null,
        })
      )

      expect(result.current.serverError).toBe('Horas invalidas.')
      expect(result.current.customModalFor).toBeNull()
    })
  })
})
