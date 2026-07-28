import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeeklyScheduleMatrix } from './useWeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { clearDayAssignment } from '@/modules/schedules/actions/clearDayAssignment'
import type { EmployeeWeekRow, DayAssignment } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

vi.mock('@/modules/schedules/actions/assignDaySchedule', () => ({
  assignDaySchedule: vi.fn(),
}))

vi.mock('@/modules/schedules/actions/assignCustomScheduleBulk', () => ({
  assignCustomScheduleBulk: vi.fn(),
}))

vi.mock('@/modules/schedules/actions/clearDayAssignment', () => ({
  clearDayAssignment: vi.fn(),
}))

const mockAssignDaySchedule = vi.mocked(assignDaySchedule)
const mockAssignCustomScheduleBulk = vi.mocked(assignCustomScheduleBulk)
const mockClearDayAssignment = vi.mocked(clearDayAssignment)

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
    branchName: 'Sucursal Central',
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
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]
      const transformedAssignment = transformedRow.days[0]

      act(() => result.current.openCustomModal(transformedRow, transformedAssignment))
      expect(result.current.customModalFor).toEqual({
        row: transformedRow,
        assignment: transformedAssignment,
      })

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
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '__free__')
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('abre el modal personalizado cuando se elige "__custom__" en vez de guardar', async () => {
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '__custom__')
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      expect(result.current.customModalFor).toEqual({
        row: transformedRow,
        assignment: transformedRow.days[0],
      })
    })

    it('no hace nada con valor vacio si la celda ya estaba sin asignar', async () => {
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '')
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      expect(mockClearDayAssignment).not.toHaveBeenCalled()
    })

    it('"Asignar horario" (valor vacio) limpia la celda cuando ya tenia una asignacion', async () => {
      mockClearDayAssignment.mockResolvedValue({ ok: true })
      const row = makeRow({
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, scheduleName: 'Turno A' })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '')
      )

      expect(mockClearDayAssignment).toHaveBeenCalledWith(7)
      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      expect(result.current.savingCell).toBeNull()
      expect(result.current.serverError).toBeNull()
    })

    it('expone el error del servidor si falla al limpiar la celda', async () => {
      mockClearDayAssignment.mockResolvedValue({ ok: false, error: 'No se pudo quitar.' })
      const row = makeRow({
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, scheduleName: 'Turno A' })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '')
      )

      expect(result.current.serverError).toBe('No se pudo quitar.')
    })

    it('marca el dia como libre cuando se elige "__free__"', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '__free__')
      )

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
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '4')
      )

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
      const transformedRow = result.current.rows[0]

      act(() => {
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '__free__')
      })

      await waitFor(() =>
        expect(result.current.savingCell).toBe(
          `${transformedRow.employmentHistoryId}-${transformedRow.days[0].date}`
        )
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
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '__free__')
      )

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
          applyToDates: [],
        })
      )

      expect(mockAssignCustomScheduleBulk).not.toHaveBeenCalled()
    })

    it('guarda las horas personalizadas y cierra el modal en exito', async () => {
      mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      act(() => result.current.openCustomModal(transformedRow, transformedRow.days[0]))

      await act(() =>
        result.current.handleCustomConfirm({
          startTime: '09:00',
          endTime: '18:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          breakStart: null,
          breakEnd: null,
          applyToDates: [transformedRow.days[0].date],
        })
      )

      expect(mockAssignCustomScheduleBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          customStartTime: '09:00',
          customEndTime: '18:00',
          customLunchStart: '12:00',
          customLunchEnd: '13:00',
          days: [{ assignmentId: null, date: transformedRow.days[0].date }],
        })
      )
      expect(result.current.customModalFor).toBeNull()
      expect(result.current.serverError).toBeNull()
    })

    it('sin applyToDates aplica por defecto al dia que abrio el modal', async () => {
      mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      act(() => result.current.openCustomModal(transformedRow, transformedRow.days[0]))

      await act(() =>
        result.current.handleCustomConfirm({
          startTime: '09:00',
          endTime: '18:00',
          lunchStart: null,
          lunchEnd: null,
          breakStart: null,
          breakEnd: null,
          applyToDates: [],
        })
      )

      expect(mockAssignCustomScheduleBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          days: [{ assignmentId: null, date: transformedRow.days[0].date }],
        })
      )
    })

    it('mantiene el error del servidor visible si falla, con el modal ya cerrado', async () => {
      mockAssignCustomScheduleBulk.mockResolvedValue({ ok: false, error: 'Horas invalidas.' })
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      act(() => result.current.openCustomModal(transformedRow, transformedRow.days[0]))

      await act(() =>
        result.current.handleCustomConfirm({
          startTime: '09:00',
          endTime: '08:00',
          lunchStart: null,
          lunchEnd: null,
          breakStart: null,
          breakEnd: null,
          applyToDates: [transformedRow.days[0].date],
        })
      )

      expect(result.current.serverError).toBe('Horas invalidas.')
      expect(result.current.customModalFor).toBeNull()
    })
  })
})
