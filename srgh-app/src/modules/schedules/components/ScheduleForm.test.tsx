import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleForm } from './ScheduleForm'
import { createSchedule } from '@/modules/schedules/actions/createSchedule'
import { updateSchedule } from '@/modules/schedules/actions/updateSchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

vi.mock('@/modules/schedules/actions/createSchedule', () => ({ createSchedule: vi.fn() }))
vi.mock('@/modules/schedules/actions/updateSchedule', () => ({ updateSchedule: vi.fn() }))

const mockCreateSchedule = vi.mocked(createSchedule)
const mockUpdateSchedule = vi.mocked(updateSchedule)

const shiftTypes = [
  { tjo_id: 1, tjo_nombre: 'Diurna' },
  { tjo_id: 2, tjo_nombre: 'Nocturna' },
]

const existingSchedule = {
  hor_id: 7,
  hor_nombre: 'Turno Diurno Tienda',
  hor_tipo_jornada_id: 1,
  hor_hora_entrada: '08:00:00',
  hor_hora_salida: '17:00:00',
  hor_hora_inicio_almuerzo: '12:00:00',
  hor_hora_fin_almuerzo: '13:00:00',
  hor_hora_inicio_break: null,
  hor_hora_fin_break: null,
  hor_duracion_almuerzo_min: 60,
  hor_duracion_break_min: 15,
  hor_activo: true,
} as unknown as ScheduleRow

describe('<ScheduleForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('modo creacion: muestra "Crear horario" y llama a createSchedule al enviar', async () => {
    mockCreateSchedule.mockResolvedValue({ ok: true, id: 1 })
    const onSuccess = vi.fn()
    render(<ScheduleForm shiftTypes={shiftTypes} onSuccess={onSuccess} />)

    expect(screen.getByRole('button', { name: /crear horario/i })).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nombre de la plantilla'), 'Turno Nuevo')
    await user.click(screen.getByRole('button', { name: /crear horario/i }))

    await waitFor(() => expect(mockCreateSchedule).toHaveBeenCalledTimes(1))
    expect(mockUpdateSchedule).not.toHaveBeenCalled()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('modo edicion: precarga los valores y llama a updateSchedule con el id', async () => {
    mockUpdateSchedule.mockResolvedValue({ ok: true })
    const onSuccess = vi.fn()
    render(
      <ScheduleForm schedule={existingSchedule} shiftTypes={shiftTypes} onSuccess={onSuccess} />
    )

    expect(screen.getByDisplayValue('Turno Diurno Tienda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /actualizar horario/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /actualizar horario/i }))

    await waitFor(() =>
      expect(mockUpdateSchedule).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ hor_nombre: 'Turno Diurno Tienda' })
      )
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('valida el nombre minimo antes de llamar a la action', async () => {
    render(<ScheduleForm shiftTypes={shiftTypes} />)

    await userEvent.click(screen.getByRole('button', { name: /crear horario/i }))

    expect(await screen.findByText(/3 characters/i)).toBeInTheDocument()
    expect(mockCreateSchedule).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor cuando la action falla', async () => {
    mockCreateSchedule.mockResolvedValue({ ok: false, error: 'El nombre ya existe.' })
    render(<ScheduleForm shiftTypes={shiftTypes} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nombre de la plantilla'), 'Duplicado')
    await user.click(screen.getByRole('button', { name: /crear horario/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El nombre ya existe.')
  })

  it('el break adicional esta oculto por defecto y aparece al activar el switch', async () => {
    render(<ScheduleForm shiftTypes={shiftTypes} />)

    expect(screen.queryByLabelText('Inicio de break')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Incluye break adicional al almuerzo'))

    expect(screen.getByLabelText('Inicio de break')).toBeInTheDocument()
    expect(screen.getByLabelText('Inicio de break')).toHaveValue('10:00')
  })

  it('el switch de break parte activo cuando el horario existente ya tiene uno', () => {
    render(
      <ScheduleForm
        schedule={
          {
            ...existingSchedule,
            hor_hora_inicio_break: '10:00:00',
            hor_hora_fin_break: '10:15:00',
          } as ScheduleRow
        }
        shiftTypes={shiftTypes}
      />
    )

    expect(screen.getByLabelText('Inicio de break')).toHaveValue('10:00')
  })
})
