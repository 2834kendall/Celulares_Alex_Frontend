import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyScheduleMatrix } from './WeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { clearDayAssignment } from '@/modules/schedules/actions/clearDayAssignment'
import { getWeekDates } from '@/modules/schedules/lib/week'
import type { DayAssignment, EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/schedule',
}))

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

const WEEK_START = '2026-01-05'
const WEEK_DATES = getWeekDates(WEEK_START)

const schedules: ScheduleRow[] = [
  { hor_id: 1, hor_nombre: 'Turno A', hor_activo: true } as ScheduleRow,
]

function makeDays(
  overrides: Partial<Record<number, Partial<DayAssignment>>> = {}
): DayAssignment[] {
  return WEEK_DATES.map((date, index) => ({
    date,
    assignmentId: null,
    scheduleId: null,
    scheduleName: null,
    startTime: null,
    endTime: null,
    isDayOff: false,
    hours: 0,
    ...overrides[index],
  }))
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
    days: makeDays(),
    weeklyTotal: 0,
    ...overrides,
  }
}

function renderMatrix(rows: EmployeeWeekRow[], canWrite = true) {
  return render(
    <WeeklyScheduleMatrix
      weekStartISO={WEEK_START}
      weekDates={WEEK_DATES}
      rows={rows}
      schedules={schedules}
      canWrite={canWrite}
    />
  )
}

describe('<WeeklyScheduleMatrix />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio cuando no hay colaboradores', () => {
    renderMatrix([])
    expect(
      screen.getAllByText('No hay colaboradores activos para esta semana').length
    ).toBeGreaterThan(0)
  })

  it('lista el nombre y puesto del colaborador', () => {
    renderMatrix([makeRow()])
    expect(screen.getAllByText('Ana Perez').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cajera').length).toBeGreaterThan(0)
  })

  it('muestra el total semanal formateado', () => {
    renderMatrix([makeRow({ weeklyTotal: 7.5 })])
    expect(screen.getAllByText('7.5 Hrs').length).toBeGreaterThan(0)
  })

  it('el calendario navega a la semana que contiene la fecha elegida', async () => {
    const user = userEvent.setup()
    renderMatrix([makeRow()])

    // Calendario propio (DatePopover), ya no el <input type="date"> nativo: se
    // abre el panel y se elige el dia por su nombre accesible completo.
    await user.click(screen.getByRole('button', { name: 'Ir a una semana especifica' }))
    await user.click(screen.getByRole('button', { name: /14 de enero de 2026/ }))

    expect(push).toHaveBeenCalledWith('/schedule?week=2026-01-12')
  })

  it('el boton "Semana actual" se deshabilita si ya se esta viendo esa semana', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 7)) // miercoles de la semana de WEEK_START

    renderMatrix([makeRow()])

    expect(screen.getByRole('button', { name: /Semana actual/ })).toBeDisabled()

    vi.useRealTimers()
  })

  it('el boton "Semana actual" navega a la semana de hoy cuando se ve otra semana', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 11)) // semana del 2026-02-09

    renderMatrix([makeRow()])
    fireEvent.click(screen.getByRole('button', { name: /Semana actual/ }))

    expect(push).toHaveBeenCalledWith('/schedule?week=2026-02-09')

    vi.useRealTimers()
  })

  it('sin permiso de escritura muestra la etiqueta en vez del select', () => {
    renderMatrix(
      [makeRow({ days: makeDays({ 0: { scheduleId: 1, scheduleName: 'Turno A' } }) })],
      false
    )

    expect(screen.queryAllByRole('combobox', { name: /Asignar horario/ })).toHaveLength(0)
    expect(screen.getAllByText('Turno A').length).toBeGreaterThan(0)
  })

  it('asigna un horario existente al elegirlo del select', async () => {
    mockAssignDaySchedule.mockResolvedValue({ ok: true })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await userEvent.selectOptions(select, '1')

    await waitFor(() =>
      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 1, isDayOff: false })
      )
    )
  })

  it('marcar como descanso llama a la action con isDayOff true', async () => {
    mockAssignDaySchedule.mockResolvedValue({ ok: true })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await userEvent.selectOptions(select, '__free__')

    await waitFor(() =>
      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ isDayOff: true })
      )
    )
  })

  it('elegir "Personalizado" abre el modal de horas sin llamar a la action', async () => {
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await userEvent.selectOptions(select, '__custom__')

    expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    expect(await screen.findByText('Horario personalizado')).toBeInTheDocument()
  })

  it('guardar horas personalizadas desde el modal llama a la action y lo cierra', async () => {
    mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await userEvent.selectOptions(select, '__custom__')

    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(mockAssignCustomScheduleBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          customStartTime: expect.any(String),
          days: [{ assignmentId: null, date: WEEK_DATES[0] }],
        })
      )
    )
    await waitFor(() => expect(screen.queryByText('Horario personalizado')).not.toBeInTheDocument())
  })

  it('muestra el error del servidor cuando falla la asignacion', async () => {
    mockAssignDaySchedule.mockResolvedValue({ ok: false, error: 'No se pudo guardar.' })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await userEvent.selectOptions(select, '__free__')

    expect(await screen.findByText('No se pudo guardar.')).toBeInTheDocument()
  })

  it('muestra la paginacion cuando hay mas de 6 colaboradores', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      makeRow({ employmentHistoryId: i + 1, fullName: `Empleado ${i + 1}` })
    )
    renderMatrix(rows)

    expect(screen.getAllByText(/Página 1 de 2/).length).toBeGreaterThan(0)
  })

  it('no muestra paginacion con 6 colaboradores o menos', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ employmentHistoryId: i + 1, fullName: `Empleado ${i + 1}` })
    )
    renderMatrix(rows)
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument()
  })
})
