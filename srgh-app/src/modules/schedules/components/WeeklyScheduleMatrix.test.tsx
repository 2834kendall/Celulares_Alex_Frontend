import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyScheduleMatrix } from './WeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
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

const mockAssignDaySchedule = vi.mocked(assignDaySchedule)

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
    fullName: 'Ana Perez',
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

  it('navega a la semana siguiente y anterior', async () => {
    renderMatrix([makeRow()])

    await userEvent.click(screen.getByLabelText('Semana siguiente'))
    expect(push).toHaveBeenCalledWith(`/schedule?week=2026-01-12`)

    await userEvent.click(screen.getByLabelText('Semana anterior'))
    expect(push).toHaveBeenCalledWith(`/schedule?week=2025-12-29`)
  })

  it('sin permiso de escritura muestra la etiqueta en vez del select', () => {
    renderMatrix(
      [makeRow({ days: makeDays({ 0: { scheduleId: 1, scheduleName: 'Turno A' } }) })],
      false
    )

    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
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
    mockAssignDaySchedule.mockResolvedValue({ ok: true })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await userEvent.selectOptions(select, '__custom__')

    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ customStartTime: expect.any(String) })
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

  it('muestra la paginacion cuando hay mas de 8 colaboradores', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      makeRow({ employmentHistoryId: i + 1, fullName: `Empleado ${i + 1}` })
    )
    renderMatrix(rows)

    expect(screen.getAllByText(/Página 1 de 2/).length).toBeGreaterThan(0)
  })

  it('no muestra paginacion con 8 colaboradores o menos', () => {
    renderMatrix([makeRow()])
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument()
  })
})
