import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SchedulesList } from './SchedulesList'
import { deleteSchedule } from '@/modules/schedules/actions/deleteSchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

vi.mock('@/modules/schedules/actions/deleteSchedule', () => ({ deleteSchedule: vi.fn() }))
vi.mock('@/modules/schedules/actions/createSchedule', () => ({ createSchedule: vi.fn() }))
vi.mock('@/modules/schedules/actions/updateSchedule', () => ({ updateSchedule: vi.fn() }))

const mockDeleteSchedule = vi.mocked(deleteSchedule)

const shiftTypes = [{ tjo_id: 1, tjo_nombre: 'Diurna' }]

function makeSchedule(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    hor_id: 1,
    hor_nombre: 'Turno Diurno',
    hor_tipo_jornada_id: 1,
    hor_hora_entrada: '08:00:00',
    hor_hora_salida: '17:00:00',
    hor_hora_inicio_almuerzo: '12:00:00',
    hor_hora_fin_almuerzo: '13:00:00',
    hor_hora_inicio_break: null,
    hor_hora_fin_break: null,
    hor_activo: true,
    ...overrides,
  } as ScheduleRow
}

/**
 * Misma data en dos ramas —tarjetas y tabla— y jsdom no aplica CSS, asi
 * que ve las dos. Solo las aserciones sobre FILAS se acotan a la tabla;
 * dialogos, formularios y estados vacios viven fuera de ambas.
 */
function tabla() {
  return within(screen.getByRole('table'))
}

describe('<SchedulesList />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio cuando no hay horarios', () => {
    render(<SchedulesList schedules={[]} shiftTypes={shiftTypes} canWrite={true} />)

    expect(screen.getByText('Todavía no hay horarios registrados')).toBeInTheDocument()
  })

  it('lista los horarios con el nombre del tipo de jornada resuelto', () => {
    render(<SchedulesList schedules={[makeSchedule()]} shiftTypes={shiftTypes} canWrite={true} />)

    expect(tabla().getByText('Turno Diurno')).toBeInTheDocument()
    expect(tabla().getByText('Diurna')).toBeInTheDocument()
  })

  it('oculta las acciones de escritura cuando canWrite es false', () => {
    render(<SchedulesList schedules={[makeSchedule()]} shiftTypes={shiftTypes} canWrite={false} />)

    expect(screen.queryByRole('button', { name: /nuevo horario/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Editar')).not.toBeInTheDocument()
  })

  it('abre y cierra el formulario de creacion', async () => {
    render(<SchedulesList schedules={[]} shiftTypes={shiftTypes} canWrite={true} />)

    await userEvent.click(screen.getByRole('button', { name: /crear la primera plantilla/i }))
    expect(screen.getByRole('heading', { name: 'Nuevo horario' })).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Cerrar formulario'))
    expect(screen.queryByRole('heading', { name: 'Nuevo horario' })).not.toBeInTheDocument()
  })

  it('confirma y elimina un horario', async () => {
    mockDeleteSchedule.mockResolvedValue({ ok: true })
    render(<SchedulesList schedules={[makeSchedule()]} shiftTypes={shiftTypes} canWrite={true} />)

    await userEvent.click(tabla().getByLabelText('Eliminar'))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(mockDeleteSchedule).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('cancelar en el dialogo de confirmacion no elimina nada', async () => {
    render(<SchedulesList schedules={[makeSchedule()]} shiftTypes={shiftTypes} canWrite={true} />)

    await userEvent.click(tabla().getByLabelText('Eliminar'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mockDeleteSchedule).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('muestra el error del servidor cuando la eliminacion falla', async () => {
    mockDeleteSchedule.mockResolvedValue({ ok: false, error: 'En uso.' })
    render(<SchedulesList schedules={[makeSchedule()]} shiftTypes={shiftTypes} canWrite={true} />)

    await userEvent.click(tabla().getByLabelText('Eliminar'))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('En uso.')
  })

  it('muestra los contadores de total y activas', () => {
    render(
      <SchedulesList
        schedules={[makeSchedule({ hor_id: 1 }), makeSchedule({ hor_id: 2, hor_activo: false })]}
        shiftTypes={shiftTypes}
        canWrite={true}
      />
    )

    const activeLabel = screen.getByText('Activas')
    const activeValue = activeLabel.parentElement?.querySelector('p:last-child')

    expect(
      screen.getByText('Total plantillas').parentElement?.querySelector('p:last-child')
    ).toHaveTextContent('2')
    expect(activeValue).toHaveTextContent('1')
  })
})
