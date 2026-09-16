import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyScheduleMatrix } from './WeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { clearDayAssignment } from '@/modules/schedules/actions/clearDayAssignment'
import { pasteWeeklySchedule } from '@/modules/schedules/actions/pasteWeeklySchedule'
import { getScheduleSuggestion } from '@/modules/schedules/actions/getScheduleSuggestion'
import { getWeekDates } from '@/modules/schedules/lib/week'
import type {
  DayAssignment,
  EmployeeWeekRow,
  SucursalOption,
} from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import type { AusenciaOverlayEntry } from '@/modules/absences/lib/overlay'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/schedule',
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

vi.mock('@/modules/schedules/actions/pasteWeeklySchedule', () => ({
  pasteWeeklySchedule: vi.fn(),
}))

vi.mock('@/modules/schedules/actions/getScheduleSuggestion', () => ({
  getScheduleSuggestion: vi.fn(),
}))

const mockAssignDaySchedule = vi.mocked(assignDaySchedule)
const mockAssignCustomScheduleBulk = vi.mocked(assignCustomScheduleBulk)
const mockClearDayAssignment = vi.mocked(clearDayAssignment)
const mockPasteWeeklySchedule = vi.mocked(pasteWeeklySchedule)
const mockGetScheduleSuggestion = vi.mocked(getScheduleSuggestion)

const WEEK_START = '2026-01-05'
const WEEK_DATES = getWeekDates(WEEK_START)

const schedules: ScheduleRow[] = [
  { hor_id: 1, hor_nombre: 'Turno A', hor_activo: true } as ScheduleRow,
]

const sucursales: SucursalOption[] = [
  { id: 100, nombre: 'Sucursal Central' },
  { id: 200, nombre: 'Sucursal Norte' },
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
    branchId: 100,
    branchName: 'Sucursal Central',
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

function renderMatrix(
  rows: EmployeeWeekRow[],
  canWrite = true,
  ausencias: AusenciaOverlayEntry[] = []
) {
  return render(
    <WeeklyScheduleMatrix
      weekStartISO={WEEK_START}
      weekDates={WEEK_DATES}
      rows={rows}
      sucursales={sucursales}
      schedules={schedules}
      canWrite={canWrite}
      ausencias={ausencias}
    />
  )
}

describe('<WeeklyScheduleMatrix />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
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

  describe('alerta de colaboradores sin horario', () => {
    // Los 7 dias con asignacion real, sin huecos.
    function fullyAssignedDays(): DayAssignment[] {
      return makeDays(
        Object.fromEntries(
          WEEK_DATES.map((_, index) => [
            index,
            { assignmentId: index + 1, scheduleId: 1, scheduleName: 'Turno A' },
          ])
        )
      )
    }

    it('avisa cuando un colaborador tiene al menos un dia sin horario', () => {
      // makeRow() por defecto: los 7 dias sin assignmentId (el caso comun en un
      // wizard recien creado o una semana que nadie llego a programar).
      renderMatrix([makeRow()])

      expect(screen.getByText('1 colaborador sin horario asignado esta semana')).toBeInTheDocument()
      expect(screen.getAllByText(/Ana Perez/).length).toBeGreaterThan(0)
    })

    it('no avisa cuando el colaborador tiene los 7 dias cubiertos', () => {
      renderMatrix([makeRow({ days: fullyAssignedDays() })])

      expect(screen.queryByText(/sin horario asignado esta semana/)).not.toBeInTheDocument()
    })

    it('un dia sin horario pero cubierto por una ausencia no cuenta como hueco', () => {
      // Dia 0 sin assignmentId pero cubierto por una incapacidad: no es un hueco.
      const days = fullyAssignedDays()
      days[0] = { ...days[0], assignmentId: null, scheduleId: null }

      renderMatrix([makeRow({ days })], true, [
        {
          employmentHistoryId: 1,
          date: WEEK_DATES[0],
          tipoNombre: 'Incapacidad',
          isIntraday: false,
        },
      ])

      expect(screen.queryByText(/sin horario asignado esta semana/)).not.toBeInTheDocument()
    })

    it('pluraliza cuando hay mas de un colaborador con huecos', () => {
      renderMatrix([
        makeRow({ employmentHistoryId: 1, fullName: 'Ana Perez' }),
        makeRow({ employmentHistoryId: 2, fullName: 'Luis Mora' }),
      ])

      expect(
        screen.getByText('2 colaboradores sin horario asignado esta semana')
      ).toBeInTheDocument()
    })

    it('clic en el aviso filtra la lista a solo quienes tienen huecos, y de nuevo la restaura', async () => {
      const user = userEvent.setup()
      renderMatrix([
        makeRow({ employmentHistoryId: 1, fullName: 'Ana Perez' }),
        makeRow({ employmentHistoryId: 2, fullName: 'Luis Mora', days: fullyAssignedDays() }),
      ])

      expect(screen.getAllByText('Luis Mora').length).toBeGreaterThan(0)

      await user.click(screen.getByRole('button', { name: /sin horario asignado esta semana/i }))

      expect(screen.getAllByText('Ana Perez').length).toBeGreaterThan(0)
      expect(screen.queryAllByText('Luis Mora')).toHaveLength(0)

      await user.click(screen.getByRole('button', { name: /mostrando solo a ellos/i }))

      expect(screen.getAllByText('Luis Mora').length).toBeGreaterThan(0)
    })

    it('el boton "X" descarta el aviso sin quitar a nadie de la lista', async () => {
      const user = userEvent.setup()
      renderMatrix([makeRow()])

      await user.click(screen.getByRole('button', { name: 'Descartar este aviso' }))

      expect(screen.queryByText(/sin horario asignado esta semana/)).not.toBeInTheDocument()
      expect(screen.getAllByText('Ana Perez').length).toBeGreaterThan(0)
    })

    it('descartar el aviso tambien apaga el filtro si estaba activo', async () => {
      const user = userEvent.setup()
      renderMatrix([
        makeRow({ employmentHistoryId: 1, fullName: 'Ana Perez' }),
        makeRow({ employmentHistoryId: 2, fullName: 'Luis Mora', days: fullyAssignedDays() }),
      ])

      await user.click(screen.getByRole('button', { name: /sin horario asignado esta semana/i }))
      expect(screen.queryAllByText('Luis Mora')).toHaveLength(0)

      await user.click(screen.getByRole('button', { name: 'Descartar este aviso' }))

      expect(screen.getAllByText('Luis Mora').length).toBeGreaterThan(0)
    })
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

  it('muestra el icono de sucursal solo en dias con una asignacion real', () => {
    renderMatrix([
      makeRow({
        days: makeDays({
          0: { scheduleId: 1, scheduleName: 'Turno A', assignmentId: 7 },
          // Martes (index 1) sin asignar: no tiene sentido elegir sucursal.
        }),
      }),
    ])

    expect(screen.getAllByLabelText('Sucursal de Ana Perez el Lunes').length).toBeGreaterThan(0)
    expect(screen.queryAllByLabelText('Sucursal de Ana Perez el Martes')).toHaveLength(0)
  })

  it('cambiar la sucursal de una celda asignada conserva el horario y llama a la action', async () => {
    mockAssignDaySchedule.mockResolvedValue({ ok: true })
    renderMatrix([
      makeRow({
        days: makeDays({ 0: { scheduleId: 1, scheduleName: 'Turno A', assignmentId: 7 } }),
      }),
    ])

    const [branchSelect] = screen.getAllByLabelText('Sucursal de Ana Perez el Lunes')
    await userEvent.selectOptions(branchSelect, '200')

    await waitFor(() =>
      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          assignmentId: 7,
          branchId: 200,
          scheduleId: 1,
          isDayOff: false,
        })
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

  it('muestra la paginacion cuando hay mas de 10 colaboradores', () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      makeRow({ employmentHistoryId: i + 1, fullName: `Empleado ${i + 1}` })
    )
    renderMatrix(rows)

    expect(screen.getAllByText(/Página 1 de 2/).length).toBeGreaterThan(0)
  })

  it('no muestra paginacion con 10 colaboradores o menos', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ employmentHistoryId: i + 1, fullName: `Empleado ${i + 1}` })
    )
    renderMatrix(rows)
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument()
  })

  it('sin permiso de escritura no muestra los iconos de copiar/pegar/generar', () => {
    renderMatrix([makeRow()], false)
    expect(
      screen.queryByRole('button', { name: 'Copiar el horario de esta vista' })
    ).not.toBeInTheDocument()
  })

  it('copiar habilita pegar, que estaba deshabilitado', async () => {
    const user = userEvent.setup()
    renderMatrix([makeRow({ days: makeDays({ 0: { scheduleId: 1, scheduleName: 'Turno A' } }) })])

    const pasteButton = screen.getByRole('button', {
      name: 'Pegar el horario copiado en esta vista',
    })
    expect(pasteButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Copiar el horario de esta vista' }))

    expect(pasteButton).toBeEnabled()
  })

  it('pegar aplica lo copiado a los mismos dias de la vista actual', async () => {
    const user = userEvent.setup()
    mockPasteWeeklySchedule.mockResolvedValue({ ok: true })
    renderMatrix([makeRow({ days: makeDays({ 0: { scheduleId: 1, scheduleName: 'Turno A' } }) })])

    await user.click(screen.getByRole('button', { name: 'Copiar el horario de esta vista' }))
    await user.click(screen.getByRole('button', { name: 'Pegar el horario copiado en esta vista' }))

    await waitFor(() =>
      expect(mockPasteWeeklySchedule).toHaveBeenCalledWith({
        employees: [
          expect.objectContaining({
            employmentHistoryId: 1,
            employeeId: 10,
            days: expect.arrayContaining([
              expect.objectContaining({
                date: WEEK_DATES[0],
                branchId: 100,
                scheduleId: 1,
                isDayOff: false,
              }),
            ]),
          }),
        ],
      })
    )
  })

  it('generar sugerido consulta el historial y aplica lo devuelto', async () => {
    const user = userEvent.setup()
    mockGetScheduleSuggestion.mockResolvedValue({
      ok: true,
      byEmployment: {
        1: [{ scheduleId: 1, isDayOff: false }, null, null, null, null, null, null],
      },
    })
    mockPasteWeeklySchedule.mockResolvedValue({ ok: true })

    renderMatrix([makeRow()])

    await user.click(
      screen.getByRole('button', { name: 'Generar horario sugerido segun el historial' })
    )

    await waitFor(() => expect(mockGetScheduleSuggestion).toHaveBeenCalledWith([1], WEEK_START))
    await waitFor(() =>
      expect(mockPasteWeeklySchedule).toHaveBeenCalledWith({
        employees: [
          expect.objectContaining({
            employmentHistoryId: 1,
            days: [
              expect.objectContaining({
                date: WEEK_DATES[0],
                branchId: 100,
                scheduleId: 1,
                isDayOff: false,
              }),
            ],
          }),
        ],
      })
    )
  })
})
