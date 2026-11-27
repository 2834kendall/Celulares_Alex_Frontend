import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyScheduleMatrix } from './WeeklyScheduleMatrix'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { assignSplitSchedule } from '@/modules/schedules/actions/assignSplitSchedule'
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

vi.mock('@/modules/schedules/actions/assignSplitSchedule', () => ({
  assignSplitSchedule: vi.fn(),
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
const mockAssignSplitSchedule = vi.mocked(assignSplitSchedule)
const mockClearDayAssignment = vi.mocked(clearDayAssignment)
const mockPasteWeeklySchedule = vi.mocked(pasteWeeklySchedule)
const mockGetScheduleSuggestion = vi.mocked(getScheduleSuggestion)

const WEEK_START = '2026-01-05'
const WEEK_DATES = getWeekDates(WEEK_START)

const schedules: ScheduleRow[] = [
  { hor_id: 1, hor_nombre: 'Turno A', hor_activo: true } as ScheduleRow,
  {
    hor_id: 9,
    hor_nombre: 'Partida',
    hor_activo: true,
    hor_hora_entrada: '07:00:00',
    hor_hora_salida: '11:00:00',
    hor_hora_entrada_2: '16:00:00',
    hor_hora_salida_2: '20:00:00',
  } as ScheduleRow,
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

/** Abre uno de los menus de la celda y elige la opcion con ese texto. */
async function chooseFrom(trigger: HTMLElement, label: string) {
  await userEvent.click(trigger)
  const option = await screen.findByRole('option', { name: label })
  await userEvent.click(within(option).getByRole('button'))
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
    await user.click(screen.getByRole('button', { name: 'Ir a una semana específica' }))
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

    expect(screen.queryAllByRole('button', { name: /Asignar horario/ })).toHaveLength(0)
    expect(screen.getAllByText('Turno A').length).toBeGreaterThan(0)
  })

  it('asigna un horario existente al elegirlo del select', async () => {
    mockAssignDaySchedule.mockResolvedValue({ ok: true })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await chooseFrom(select, 'Turno A')

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
    await chooseFrom(branchSelect, 'Sucursal Norte')

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
    await chooseFrom(select, 'Descanso')

    await waitFor(() =>
      expect(mockAssignDaySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ isDayOff: true })
      )
    )
  })

  it('elegir "Personalizado" abre el modal de horas sin llamar a la action', async () => {
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await chooseFrom(select, 'Personalizado')

    expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    expect(await screen.findByText('Horario personalizado')).toBeInTheDocument()
  })

  it('guardar horas personalizadas desde el modal llama a la action y lo cierra', async () => {
    mockAssignCustomScheduleBulk.mockResolvedValue({ ok: true })
    renderMatrix([makeRow()])

    const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
    await chooseFrom(select, 'Personalizado')

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
    await chooseFrom(select, 'Descanso')

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
      screen.getByRole('button', { name: 'Generar horario sugerido según el historial' })
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

  describe('varios tramos en un dia (SGRH-110)', () => {
    // Lunes: 8-12 en Central y 13-17 en Norte, ambas sucursales ya usadas.
    function twoTramoRow(): EmployeeWeekRow {
      return makeRow({
        weeklyTotal: 8,
        days: makeDays({
          0: {
            assignmentId: 7,
            scheduleId: 1,
            scheduleName: 'Turno A',
            hours: 4,
            branchId: 100,
            branchName: 'Sucursal Central',
            extraTramos: [
              {
                date: WEEK_DATES[0],
                assignmentId: 8,
                scheduleId: 2,
                scheduleName: 'Turno B',
                startTime: '13:00:00',
                endTime: '17:00:00',
                isDayOff: false,
                hours: 4,
                branchId: 200,
                branchName: 'Sucursal Norte',
              },
            ],
          },
        }),
      })
    }

    it('muestra cada tramo del dia con su horario', () => {
      renderMatrix([twoTramoRow()])

      expect(screen.getAllByText('Turno A').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Turno B').length).toBeGreaterThan(0)
      // Un selector de sucursal por tramo (vista movil + vista de escritorio).
      expect(screen.getAllByLabelText('Sucursal de Ana Perez el Lunes')).toHaveLength(4)
    })

    it('la etiqueta de horas del dia suma todos los tramos (vista movil)', () => {
      renderMatrix([twoTramoRow()])

      expect(screen.getAllByText('8 h').length).toBeGreaterThan(0)
    })

    it('quitar el horario de un tramo extra borra solo esa fila', async () => {
      mockClearDayAssignment.mockResolvedValue({ ok: true })
      renderMatrix([twoTramoRow()])

      // Orden en el DOM: tramo 1 y tramo 2 de la vista movil, luego los de escritorio.
      const selects = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
      await chooseFrom(selects[1], 'Asignar horario')

      await waitFor(() => expect(mockClearDayAssignment).toHaveBeenCalledWith(8))
      expect(mockClearDayAssignment).toHaveBeenCalledTimes(1)
    })

    it('agrega un segundo tramo en otra sucursal con el horario elegido', async () => {
      mockAssignDaySchedule.mockResolvedValue({ ok: true })
      const user = userEvent.setup()
      renderMatrix([
        makeRow({
          days: makeDays({
            0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A', branchId: 100 },
          }),
        }),
      ])

      await user.click(screen.getAllByLabelText('Agregar tramo para Ana Perez el Lunes')[0])

      // La sucursal propuesta es la primera que todavia no tiene tramo ese dia.
      const [branchSelect] = screen.getAllByLabelText(
        'Sucursal del nuevo tramo de Ana Perez el Lunes'
      )
      expect(branchSelect).toHaveTextContent('Sucursal Norte')

      const [scheduleSelect] = screen.getAllByLabelText(
        'Horario del nuevo tramo de Ana Perez el Lunes'
      )
      await chooseFrom(scheduleSelect, 'Turno A')

      await waitFor(() =>
        expect(mockAssignDaySchedule).toHaveBeenCalledWith(
          expect.objectContaining({
            assignmentId: null,
            branchId: 200,
            date: WEEK_DATES[0],
            scheduleId: 1,
            isDayOff: false,
          })
        )
      )
      // El tramo existente no se toca.
      expect(mockAssignDaySchedule).toHaveBeenCalledTimes(1)
    })

    it('elegir "Personalizado" en el tramo nuevo abre el modal sin guardar nada', async () => {
      const user = userEvent.setup()
      renderMatrix([
        makeRow({
          days: makeDays({
            0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A', branchId: 100 },
          }),
        }),
      ])

      await user.click(screen.getAllByLabelText('Agregar tramo para Ana Perez el Lunes')[0])
      const [scheduleSelect] = screen.getAllByLabelText(
        'Horario del nuevo tramo de Ana Perez el Lunes'
      )
      await chooseFrom(scheduleSelect, 'Personalizado')

      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      expect(await screen.findByText('Horario personalizado')).toBeInTheDocument()
    })

    it('cancelar descarta el tramo nuevo sin guardar', async () => {
      const user = userEvent.setup()
      renderMatrix([
        makeRow({
          days: makeDays({
            0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A', branchId: 100 },
          }),
        }),
      ])

      await user.click(screen.getAllByLabelText('Agregar tramo para Ana Perez el Lunes')[0])
      await user.click(screen.getAllByRole('button', { name: 'Cancelar' })[0])

      expect(
        screen.queryAllByLabelText('Horario del nuevo tramo de Ana Perez el Lunes')
      ).toHaveLength(0)
      expect(mockAssignDaySchedule).not.toHaveBeenCalled()
    })

    it('no ofrece agregar tramo cuando todas las sucursales ya tienen uno', () => {
      renderMatrix([twoTramoRow()])

      expect(screen.queryAllByLabelText('Agregar tramo para Ana Perez el Lunes')).toHaveLength(0)
    })

    it.each([
      ['un dia sin asignar', makeDays()],
      ['un dia de descanso', makeDays({ 0: { assignmentId: 7, isDayOff: true, branchId: 100 } })],
    ])('no ofrece agregar tramo en %s', (_name, days) => {
      renderMatrix([makeRow({ days })])

      expect(screen.queryAllByLabelText('Agregar tramo para Ana Perez el Lunes')).toHaveLength(0)
    })

    it('sin permiso de escritura no ofrece agregar tramo', () => {
      renderMatrix(
        [
          makeRow({
            days: makeDays({
              0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A', branchId: 100 },
            }),
          }),
        ],
        false
      )

      expect(screen.queryAllByLabelText('Agregar tramo para Ana Perez el Lunes')).toHaveLength(0)
    })

    it('una ausencia bloquea el dia entero y oculta los tramos', () => {
      renderMatrix([twoTramoRow()], true, [
        {
          employmentHistoryId: 1,
          date: WEEK_DATES[0],
          tipoNombre: 'Incapacidad',
          isIntraday: false,
        },
      ])

      expect(screen.getAllByText('Incapacidad').length).toBeGreaterThan(0)
      expect(screen.queryAllByText('Turno B')).toHaveLength(0)
      expect(screen.queryAllByLabelText('Agregar tramo para Ana Perez el Lunes')).toHaveLength(0)
    })

    describe('copiar, pegar y sugerir', () => {
      const pasteButton = () =>
        screen.getByRole('button', { name: 'Pegar el horario copiado en esta vista' })
      const copyButton = () =>
        screen.getByRole('button', { name: 'Copiar el horario de esta vista' })

      it('pegar lleva los dos tramos, cada uno con su sucursal', async () => {
        const user = userEvent.setup()
        mockPasteWeeklySchedule.mockResolvedValue({ ok: true })
        renderMatrix([twoTramoRow()])

        await user.click(copyButton())
        await user.click(pasteButton())

        await waitFor(() => expect(mockPasteWeeklySchedule).toHaveBeenCalledTimes(1))
        const { employees } = mockPasteWeeklySchedule.mock.calls[0][0]
        const monday = employees[0].days.find((day) => day.date === WEEK_DATES[0])

        expect(monday).toMatchObject({
          assignmentId: 7,
          branchId: 100,
          scheduleId: 1,
          isDayOff: false,
          extraTramos: [{ branchId: 200, scheduleId: 2 }],
          // El destino ya tenia ese tramo extra: se reemplaza, no se duplica.
          replaceTramoIds: [8],
        })
      })

      it('un dia de un solo tramo se pega como siempre, sin campos de tramos', async () => {
        const user = userEvent.setup()
        mockPasteWeeklySchedule.mockResolvedValue({ ok: true })
        renderMatrix([
          makeRow({
            days: makeDays({ 0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A' } }),
          }),
        ])

        await user.click(copyButton())
        await user.click(pasteButton())

        await waitFor(() => expect(mockPasteWeeklySchedule).toHaveBeenCalledTimes(1))
        const monday = mockPasteWeeklySchedule.mock.calls[0][0].employees[0].days[0]
        expect(monday).not.toHaveProperty('extraTramos')
        expect(monday).not.toHaveProperty('replaceTramoIds')
      })

      it('pegar un dia de un tramo sobre uno de dos manda reemplazar el tramo extra del destino', async () => {
        const user = userEvent.setup()
        mockPasteWeeklySchedule.mockResolvedValue({ ok: true })

        // Semana origen: lunes de un solo tramo. Se copia y se desmonta.
        const first = renderMatrix([
          makeRow({
            days: makeDays({ 0: { assignmentId: 1, scheduleId: 1, scheduleName: 'Turno A' } }),
          }),
        ])
        await user.click(copyButton())
        first.unmount()

        // Semana destino: el mismo colaborador con dos tramos el lunes.
        renderMatrix([twoTramoRow()])
        await user.click(pasteButton())

        await waitFor(() => expect(mockPasteWeeklySchedule).toHaveBeenCalledTimes(1))
        const monday = mockPasteWeeklySchedule.mock.calls[0][0].employees[0].days[0]
        expect(monday).toMatchObject({ assignmentId: 7, scheduleId: 1, replaceTramoIds: [8] })
        expect(monday).not.toHaveProperty('extraTramos')
      })

      it('pegar un dia de dos tramos sobre uno sin asignar los crea', async () => {
        const user = userEvent.setup()
        mockPasteWeeklySchedule.mockResolvedValue({ ok: true })

        const first = renderMatrix([twoTramoRow()])
        await user.click(copyButton())
        first.unmount()

        renderMatrix([makeRow()])
        await user.click(pasteButton())

        await waitFor(() => expect(mockPasteWeeklySchedule).toHaveBeenCalledTimes(1))
        const monday = mockPasteWeeklySchedule.mock.calls[0][0].employees[0].days.find(
          (day) => day.date === WEEK_DATES[0]
        )
        expect(monday).toMatchObject({
          assignmentId: null,
          branchId: 100,
          extraTramos: [{ branchId: 200, scheduleId: 2 }],
        })
        expect(monday).not.toHaveProperty('replaceTramoIds')
      })

      it('un dia bloqueado por ausencia no se toca al pegar', async () => {
        const user = userEvent.setup()
        mockPasteWeeklySchedule.mockResolvedValue({ ok: true })
        const ausencia = {
          employmentHistoryId: 1,
          date: WEEK_DATES[0],
          tipoNombre: 'Incapacidad',
          isIntraday: false,
        }

        const first = renderMatrix([twoTramoRow()])
        await user.click(copyButton())
        first.unmount()

        renderMatrix([twoTramoRow()], true, [ausencia])
        await user.click(pasteButton())

        // El resto de la semana (sin asignar en el origen) si se pega; el lunes bloqueado, no.
        await waitFor(() => expect(mockPasteWeeklySchedule).toHaveBeenCalledTimes(1))
        const dates = mockPasteWeeklySchedule.mock.calls[0][0].employees[0].days.map(
          (day) => day.date
        )
        expect(dates).not.toContain(WEEK_DATES[0])
        expect(dates).toHaveLength(6)
      })

      it('generar sugerido aplica los dos tramos de un dia con su sucursal', async () => {
        const user = userEvent.setup()
        mockGetScheduleSuggestion.mockResolvedValue({
          ok: true,
          byEmployment: {
            1: [
              {
                scheduleId: 1,
                isDayOff: false,
                branchId: 100,
                extraTramos: [{ scheduleId: 2, isDayOff: false, branchId: 200 }],
              },
              null,
              null,
              null,
              null,
              null,
              null,
            ],
          },
        })
        mockPasteWeeklySchedule.mockResolvedValue({ ok: true })
        renderMatrix([makeRow()])

        await user.click(
          screen.getByRole('button', { name: 'Generar horario sugerido según el historial' })
        )

        await waitFor(() => expect(mockPasteWeeklySchedule).toHaveBeenCalledTimes(1))
        const monday = mockPasteWeeklySchedule.mock.calls[0][0].employees[0].days[0]
        expect(monday).toMatchObject({
          branchId: 100,
          scheduleId: 1,
          extraTramos: [{ branchId: 200, scheduleId: 2 }],
        })
      })
    })
  })

  describe('jornada partida (SGRH-110)', () => {
    const partidaDay = {
      assignmentId: 7,
      scheduleId: 9,
      scheduleName: 'Partida',
      startTime: '07:00:00',
      endTime: '11:00:00',
      secondStartTime: '16:00:00',
      secondEndTime: '20:00:00',
      hours: 8,
      branchId: 100,
    }

    it('muestra los dos bloques en la celda', () => {
      renderMatrix([makeRow({ weeklyTotal: 8, days: makeDays({ 0: partidaDay }) })])

      expect(screen.getAllByText('07:00 - 11:00 · 16:00 - 20:00').length).toBeGreaterThan(0)
    })

    it('un dia con jornada partida no deja agregar mas tramos', () => {
      renderMatrix([makeRow({ weeklyTotal: 8, days: makeDays({ 0: partidaDay }) })])

      expect(screen.queryAllByLabelText('Agregar tramo para Ana Perez el Lunes')).toHaveLength(0)
    })

    it('el mismo dia con un horario de un solo bloque si deja agregar tramo', () => {
      renderMatrix([
        makeRow({
          days: makeDays({ 0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A' } }),
        }),
      ])

      expect(
        screen.getAllByLabelText('Agregar tramo para Ana Perez el Lunes').length
      ).toBeGreaterThan(0)
    })

    it('no ofrece la plantilla partida en un tramo nuevo', async () => {
      const user = userEvent.setup()
      renderMatrix([
        makeRow({
          days: makeDays({ 0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A' } }),
        }),
      ])

      await user.click(screen.getAllByLabelText('Agregar tramo para Ana Perez el Lunes')[0])
      const [scheduleSelect] = screen.getAllByLabelText(
        'Horario del nuevo tramo de Ana Perez el Lunes'
      )
      await user.click(scheduleSelect)

      expect(await screen.findByRole('option', { name: 'Turno A' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'Partida' })).not.toBeInTheDocument()
    })

    it('no ofrece la plantilla partida en un dia que ya tiene varios tramos', async () => {
      const user = userEvent.setup()
      renderMatrix([
        makeRow({
          days: makeDays({
            0: {
              assignmentId: 7,
              scheduleId: 1,
              scheduleName: 'Turno A',
              branchId: 100,
              extraTramos: [
                {
                  date: WEEK_DATES[0],
                  assignmentId: 8,
                  scheduleId: 1,
                  scheduleName: 'Turno A',
                  startTime: '13:00:00',
                  endTime: '17:00:00',
                  isDayOff: false,
                  hours: 4,
                  branchId: 200,
                  branchName: 'Sucursal Norte',
                },
              ],
            },
          }),
        }),
      ])

      const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
      await user.click(select)

      expect(await screen.findByRole('option', { name: 'Turno A' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'Partida' })).not.toBeInTheDocument()
    })

    it('en un dia de un solo tramo la plantilla partida si se ofrece', async () => {
      const user = userEvent.setup()
      renderMatrix([makeRow()])

      const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
      await user.click(select)

      expect(await screen.findByRole('option', { name: 'Partida' })).toBeInTheDocument()
    })

    describe('plantilla con sucursal por bloque', () => {
      const conSucursales = (first: number | null, second: number | null): ScheduleRow[] => [
        schedules[0],
        { ...schedules[1], hor_sucursal_id: first, hor_sucursal_id_2: second } as ScheduleRow,
      ]

      function renderConPlantilla(plantillas: ScheduleRow[], rows = [makeRow()]) {
        return render(
          <WeeklyScheduleMatrix
            weekStartISO={WEEK_START}
            weekDates={WEEK_DATES}
            rows={rows}
            sucursales={sucursales}
            schedules={plantillas}
            canWrite
            ausencias={[]}
          />
        )
      }

      it('con sucursales distintas reparte el dia en dos tramos sin preguntar nada', async () => {
        mockAssignSplitSchedule.mockResolvedValue({ ok: true })
        renderConPlantilla(conSucursales(100, 200))

        const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
        await chooseFrom(select, 'Partida')

        await waitFor(() =>
          expect(mockAssignSplitSchedule).toHaveBeenCalledWith({
            assignmentId: null,
            employmentHistoryId: 1,
            employeeId: 10,
            date: WEEK_DATES[0],
            scheduleId: 9,
          })
        )
        expect(mockAssignDaySchedule).not.toHaveBeenCalled()
      })

      it('reemplaza el tramo que ya tenia el dia', async () => {
        mockAssignSplitSchedule.mockResolvedValue({ ok: true })
        renderConPlantilla(conSucursales(100, 200), [
          makeRow({
            days: makeDays({ 0: { assignmentId: 7, scheduleId: 1, scheduleName: 'Turno A' } }),
          }),
        ])

        const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
        await chooseFrom(select, 'Partida')

        await waitFor(() =>
          expect(mockAssignSplitSchedule).toHaveBeenCalledWith(
            expect.objectContaining({ assignmentId: 7, scheduleId: 9 })
          )
        )
      })

      it('con la misma sucursal en los dos bloques es un solo tramo en esa sucursal', async () => {
        mockAssignDaySchedule.mockResolvedValue({ ok: true })
        renderConPlantilla(conSucursales(200, 200))

        const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
        await chooseFrom(select, 'Partida')

        await waitFor(() =>
          expect(mockAssignDaySchedule).toHaveBeenCalledWith(
            expect.objectContaining({ scheduleId: 9, branchId: 200 })
          )
        )
        expect(mockAssignSplitSchedule).not.toHaveBeenCalled()
      })

      it('sin sucursales en la plantilla usa la sucursal del dia', async () => {
        mockAssignDaySchedule.mockResolvedValue({ ok: true })
        renderConPlantilla(conSucursales(null, null))

        const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
        await chooseFrom(select, 'Partida')

        await waitFor(() =>
          expect(mockAssignDaySchedule).toHaveBeenCalledWith(
            expect.objectContaining({ scheduleId: 9, branchId: 100 })
          )
        )
        expect(mockAssignSplitSchedule).not.toHaveBeenCalled()
      })

      it('muestra el error del servidor si falla el reparto', async () => {
        mockAssignSplitSchedule.mockResolvedValue({
          ok: false,
          error: 'Se guardó el primer bloque, pero no el segundo.',
        })
        renderConPlantilla(conSucursales(100, 200))

        const [select] = screen.getAllByLabelText('Asignar horario para Ana Perez el Lunes')
        await chooseFrom(select, 'Partida')

        expect(
          await screen.findByText('Se guardó el primer bloque, pero no el segundo.')
        ).toBeInTheDocument()
      })
    })
  })
})
