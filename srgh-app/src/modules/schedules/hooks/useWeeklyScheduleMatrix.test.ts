import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeeklyScheduleMatrix } from './useWeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { assignSplitSchedule } from '@/modules/schedules/actions/assignSplitSchedule'
import { clearDayAssignment } from '@/modules/schedules/actions/clearDayAssignment'
import type { EmployeeWeekRow, DayAssignment } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

vi.mock('@/modules/schedules/actions/assignDaySchedule', () => ({
  assignDaySchedule: vi.fn(),
}))

vi.mock('@/modules/schedules/actions/assignCustomScheduleBulk', () => ({
  assignCustomScheduleBulk: vi.fn(),
}))

vi.mock('@/modules/schedules/actions/assignSplitSchedule', () => ({
  assignSplitSchedule: vi.fn(),
}))

vi.mock('@/modules/schedules/actions/clearDayAssignment', () => ({
  clearDayAssignment: vi.fn(),
}))

const mockAssignDaySchedule = vi.mocked(assignDaySchedule)
const mockAssignCustomScheduleBulk = vi.mocked(assignCustomScheduleBulk)
const mockAssignSplitSchedule = vi.mocked(assignSplitSchedule)
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
    branchId: 100,
    branchName: 'Sucursal Central',
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
    fotoUrl: null,
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

    it('con plantilla Y horas propias (jornada partida) devuelve la plantilla', () => {
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [], schedules: [], canWrite: true })
      )
      expect(
        result.current.getAssignmentValue(
          makeAssignment({ scheduleId: 7, customStartTime: '07:00' })
        )
      ).toBe('7')
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

    it('conserva la sucursal del dia al cambiarle el horario (turno cubierto en otra sucursal)', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow({
        branchId: 100,
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, branchId: 200 })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '5')
      )

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentId: 7, scheduleId: 5, branchId: 200 })
      )
    })

    it('un dia sin asignar manda la sucursal que trae la celda (la de casa)', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow({ branchId: 100, days: [makeAssignment({ branchId: 100 })] })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleAssignmentChange(transformedRow, transformedRow.days[0], '4')
      )

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentId: null, branchId: 100 })
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

  describe('handleBranchChange', () => {
    it('no hace nada si canWrite es false', async () => {
      const row = makeRow({
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, branchId: 100 })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: false })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleBranchChange(transformedRow, transformedRow.days[0], 200)
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('no hace nada en un dia sin asignacion (nada cuya sucursal cambiar)', async () => {
      const row = makeRow()
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleBranchChange(transformedRow, transformedRow.days[0], 200)
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('no hace nada si se elige la misma sucursal que ya tenia', async () => {
      const row = makeRow({
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, branchId: 100 })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleBranchChange(transformedRow, transformedRow.days[0], 100)
      )

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('conserva el horario asignado y cambia solo la sucursal', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow({
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, branchId: 100 })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleBranchChange(transformedRow, transformedRow.days[0], 200)
      )

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          assignmentId: 7,
          branchId: 200,
          scheduleId: 4,
          isDayOff: false,
        })
      )
      expect(result.current.savingCell).toBeNull()
      expect(result.current.serverError).toBeNull()
    })

    it('conserva las horas personalizadas al cambiar la sucursal de un dia "Personalizado"', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow({
        days: [
          makeAssignment({
            assignmentId: 7,
            branchId: 100,
            customStartTime: '09:00',
            customEndTime: '18:00',
          }),
        ],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleBranchChange(transformedRow, transformedRow.days[0], 200)
      )

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 200,
          scheduleId: null,
          customStartTime: '09:00',
          customEndTime: '18:00',
        })
      )
    })

    it('expone el error del servidor cuando la action falla', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: false, error: 'No se pudo guardar.' })
      const row = makeRow({
        days: [makeAssignment({ assignmentId: 7, scheduleId: 4, branchId: 100 })],
      })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]

      await act(() =>
        result.current.handleBranchChange(transformedRow, transformedRow.days[0], 200)
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
          branchId: 100,
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
          branchId: 100,
        })
      )

      expect(mockAssignCustomScheduleBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 100,
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
          branchId: 100,
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
          branchId: 100,
        })
      )

      expect(result.current.serverError).toBe('Horas invalidas.')
      expect(result.current.customModalFor).toBeNull()
    })
  })

  describe('varios tramos en un dia (SGRH-110)', () => {
    const manana = makeAssignment({
      assignmentId: 11,
      scheduleId: 1,
      scheduleName: 'Manana',
      startTime: '08:00:00',
      endTime: '12:00:00',
      hours: 4,
      branchId: 100,
      branchName: 'Infinity',
      extraTramos: [
        makeAssignment({
          assignmentId: 12,
          scheduleId: 2,
          scheduleName: 'Tarde',
          startTime: '13:00:00',
          endTime: '17:00:00',
          hours: 4,
          branchId: 200,
          branchName: 'Celulares Alex',
        }),
      ],
    })

    it('etiqueta con ausencia nula cada tramo extra cuando no hay ausencia', () => {
      const row = makeRow({ days: [manana], weeklyTotal: 8 })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      const day = result.current.rows[0].days[0]
      expect(day.ausencia).toBeNull()
      expect(day.extraTramos).toHaveLength(1)
      expect(day.extraTramos?.[0]).toMatchObject({ assignmentId: 12, ausencia: null, hours: 4 })
      expect(result.current.rows[0].weeklyTotal).toBe(8)
    })

    it('un dia sin tramos extra no gana la propiedad extraTramos', () => {
      const row = makeRow({ days: [makeAssignment({ assignmentId: 1, hours: 8 })], weeklyTotal: 8 })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )

      expect('extraTramos' in result.current.rows[0].days[0]).toBe(false)
    })

    it('una incapacidad deja en cero las horas de todos los tramos y las descuenta del total', () => {
      const row = makeRow({ days: [manana], weeklyTotal: 8 })
      const ausencia = {
        employmentHistoryId: row.employmentHistoryId,
        date: manana.date,
        tipoNombre: 'Incapacidad',
        isIntraday: false,
      }
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({
          rows: [row],
          schedules: [],
          canWrite: true,
          ausencias: [ausencia],
        })
      )

      const day = result.current.rows[0].days[0]
      expect(day.hours).toBe(0)
      expect(day.extraTramos?.[0]).toMatchObject({ hours: 0, ausencia })
      expect(result.current.rows[0].weeklyTotal).toBe(0)
    })

    it('un permiso intradia (lactancia) no cambia las horas de ningun tramo', () => {
      const row = makeRow({ days: [manana], weeklyTotal: 8 })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({
          rows: [row],
          schedules: [],
          canWrite: true,
          ausencias: [
            {
              employmentHistoryId: row.employmentHistoryId,
              date: manana.date,
              tipoNombre: 'Lactancia',
              isIntraday: true,
            },
          ],
        })
      )

      const day = result.current.rows[0].days[0]
      expect(day.hours).toBe(4)
      expect(day.extraTramos?.[0].hours).toBe(4)
      expect(result.current.rows[0].weeklyTotal).toBe(8)
    })

    it('borrar un tramo extra quita solo esa fila', async () => {
      mockClearDayAssignment.mockResolvedValue({ ok: true })
      const row = makeRow({ days: [manana], weeklyTotal: 8 })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]
      const extra = transformedRow.days[0].extraTramos![0]

      await act(() => result.current.handleAssignmentChange(transformedRow, extra, ''))

      expect(mockClearDayAssignment).toHaveBeenCalledTimes(1)
      expect(mockClearDayAssignment).toHaveBeenCalledWith(12)
    })

    it('cambiar el horario de un tramo extra conserva su sucursal y su fila', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow({ days: [manana], weeklyTotal: 8 })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]
      const extra = transformedRow.days[0].extraTramos![0]

      await act(() => result.current.handleAssignmentChange(transformedRow, extra, '3'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentId: 12, branchId: 200, scheduleId: 3 })
      )
    })

    it('un tramo nuevo (sin fila) se crea con la sucursal elegida', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const row = makeRow({ days: [manana], weeklyTotal: 8 })
      const { result } = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
      )
      const transformedRow = result.current.rows[0]
      const blank = {
        ...makeAssignment({ branchId: 300, branchName: 'Tercera' }),
        ausencia: null,
        extraTramos: undefined,
      }

      await act(() => result.current.handleAssignmentChange(transformedRow, blank, '3'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentId: null, branchId: 300, scheduleId: 3 })
      )
    })

    describe('horas personalizadas', () => {
      const values = {
        startTime: '14:00',
        endTime: '18:00',
        lunchStart: null,
        lunchEnd: null,
        breakStart: null,
        breakEnd: null,
      }

      it('editar un tramo extra usa la fila de ese tramo, no la del primero', async () => {
        mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
        const row = makeRow({ days: [manana], weeklyTotal: 8 })
        const { result } = renderHook(() =>
          useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
        )
        const transformedRow = result.current.rows[0]
        const extra = transformedRow.days[0].extraTramos![0]

        act(() => result.current.openCustomModal(transformedRow, extra))
        await act(() =>
          result.current.handleCustomConfirm({
            ...values,
            applyToDates: [manana.date],
            branchId: 200,
          })
        )

        expect(mockAssignCustomScheduleBulk).toHaveBeenCalledWith(
          expect.objectContaining({ days: [{ assignmentId: 12, date: manana.date }] })
        )
      })

      it('un tramo nuevo desde el modal no pisa ninguna fila existente', async () => {
        mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
        const row = makeRow({ days: [manana], weeklyTotal: 8 })
        const { result } = renderHook(() =>
          useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
        )
        const transformedRow = result.current.rows[0]
        const blank = {
          ...makeAssignment({ branchId: 300 }),
          ausencia: null,
          extraTramos: undefined,
        }

        act(() => result.current.openCustomModal(transformedRow, blank))
        await act(() =>
          result.current.handleCustomConfirm({
            ...values,
            applyToDates: [manana.date],
            branchId: 300,
          })
        )

        expect(mockAssignCustomScheduleBulk).toHaveBeenCalledWith(
          expect.objectContaining({ days: [{ assignmentId: null, date: manana.date }] })
        )
      })

      describe('en otras fechas', () => {
        const otroDia = makeAssignment({
          date: '2026-01-06',
          assignmentId: 21,
          scheduleId: 1,
          branchId: 100,
          hours: 4,
          extraTramos: [
            makeAssignment({ date: '2026-01-06', assignmentId: 22, branchId: 200, hours: 4 }),
          ],
        })
        const diaSimple = makeAssignment({
          date: '2026-01-07',
          assignmentId: 31,
          scheduleId: 1,
          branchId: 100,
          hours: 8,
        })

        async function confirmar(branchId: number) {
          mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
          const row = makeRow({ days: [manana, otroDia, diaSimple], weeklyTotal: 16 })
          const { result } = renderHook(() =>
            useWeeklyScheduleMatrix({ rows: [row], schedules: [], canWrite: true })
          )
          const transformedRow = result.current.rows[0]

          act(() => result.current.openCustomModal(transformedRow, transformedRow.days[0]))
          await act(() =>
            result.current.handleCustomConfirm({
              ...values,
              applyToDates: [manana.date, otroDia.date, diaSimple.date],
              branchId,
            })
          )
          return mockAssignCustomScheduleBulk.mock.calls[0][0].days
        }

        it('usa el tramo de la misma sucursal cuando el dia tiene varios', async () => {
          const days = await confirmar(200)
          expect(days).toEqual([
            { assignmentId: 11, date: manana.date },
            { assignmentId: 22, date: otroDia.date },
            { assignmentId: 31, date: diaSimple.date },
          ])
        })

        it('un dia con varios tramos y ninguno de esa sucursal crea uno nuevo en vez de pisar otro', async () => {
          const days = await confirmar(300)
          expect(days).toEqual([
            { assignmentId: 11, date: manana.date },
            { assignmentId: null, date: otroDia.date },
            // Un dia con un solo tramo se comporta como antes: se reescribe ese tramo.
            { assignmentId: 31, date: diaSimple.date },
          ])
        })
      })
    })
  })

  describe('jornada partida con sucursal por bloque (SGRH-110)', () => {
    const partida = (sucursales: { first: number | null; second: number | null }) =>
      ({
        hor_id: 9,
        hor_nombre: 'Partida',
        hor_activo: true,
        hor_hora_entrada: '07:00:00',
        hor_hora_salida: '11:00:00',
        hor_hora_entrada_2: '16:00:00',
        hor_hora_salida_2: '20:00:00',
        hor_sucursal_id: sucursales.first,
        hor_sucursal_id_2: sucursales.second,
      }) as ScheduleRow
    const simple = { hor_id: 1, hor_activo: true } as ScheduleRow

    function setup(template: ScheduleRow) {
      const row = makeRow({ days: [makeAssignment({ assignmentId: 5, branchId: 100 })] })
      const hook = renderHook(() =>
        useWeeklyScheduleMatrix({ rows: [row], schedules: [simple, template], canWrite: true })
      )
      const transformedRow = hook.result.current.rows[0]
      return { ...hook, transformedRow, day: transformedRow.days[0] }
    }

    it('con sucursales distintas en la plantilla reparte el dia en dos tramos', async () => {
      mockAssignSplitSchedule.mockResolvedValue({ ok: true })
      const { result, transformedRow, day } = setup(partida({ first: 10, second: 20 }))

      await act(() => result.current.handleAssignmentChange(transformedRow, day, '9'))

      expect(mockAssignSplitSchedule).toHaveBeenCalledWith({
        assignmentId: 5,
        employmentHistoryId: 1,
        employeeId: 10,
        date: '2026-01-05',
        scheduleId: 9,
      })
      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      expect(result.current.serverError).toBeNull()
    })

    it('con la misma sucursal en los dos bloques es un tramo en esa sucursal, no la de la celda', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const { result, transformedRow, day } = setup(partida({ first: 20, second: 20 }))

      await act(() => result.current.handleAssignmentChange(transformedRow, day, '9'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentId: 5, branchId: 20, scheduleId: 9, isDayOff: false })
      )
      expect(mockAssignSplitSchedule).not.toHaveBeenCalled()
    })

    it('sin sucursales en la plantilla se queda con la de la celda, como siempre', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const { result, transformedRow, day } = setup(partida({ first: null, second: null }))

      await act(() => result.current.handleAssignmentChange(transformedRow, day, '9'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 100, scheduleId: 9 })
      )
      expect(mockAssignSplitSchedule).not.toHaveBeenCalled()
    })

    it('una plantilla de un solo bloque ignora cualquier sucursal de plantilla', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const { result, transformedRow, day } = setup(partida({ first: 10, second: 20 }))

      await act(() => result.current.handleAssignmentChange(transformedRow, day, '1'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 100, scheduleId: 1 })
      )
      expect(mockAssignSplitSchedule).not.toHaveBeenCalled()
    })

    it('marcar el dia libre no usa la sucursal de ninguna plantilla', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const { result, transformedRow, day } = setup(partida({ first: 10, second: 20 }))

      await act(() => result.current.handleAssignmentChange(transformedRow, day, '__free__'))

      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 100, scheduleId: null, isDayOff: true })
      )
    })

    it('expone el error del servidor si falla el reparto', async () => {
      mockAssignSplitSchedule.mockResolvedValue({
        ok: false,
        error: 'Se guardó el primer bloque, pero no el segundo.',
      })
      const { result, transformedRow, day } = setup(partida({ first: 10, second: 20 }))

      await act(() => result.current.handleAssignmentChange(transformedRow, day, '9'))

      expect(result.current.serverError).toBe('Se guardó el primer bloque, pero no el segundo.')
      expect(result.current.savingCell).toBeNull()
    })
  })
})
