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

    expect(screen.queryByLabelText('Inicio de break: hora')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Incluye break adicional al almuerzo'))

    expect(screen.getByLabelText('Inicio de break: hora')).toBeInTheDocument()
    expect(screen.getByLabelText('Inicio de break: hora')).toHaveTextContent('10')
    expect(screen.getByLabelText('Inicio de break: minutos')).toHaveTextContent('00')
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

    expect(screen.getByLabelText('Inicio de break: hora')).toHaveTextContent('10')
    expect(screen.getByLabelText('Inicio de break: minutos')).toHaveTextContent('00')
  })

  describe('jornada partida (segundo bloque)', () => {
    const partida = {
      ...existingSchedule,
      hor_hora_salida: '12:00:00',
      hor_hora_inicio_almuerzo: '12:00:00',
      hor_hora_fin_almuerzo: '14:00:00',
      hor_hora_entrada_2: '14:00:00',
      hor_hora_salida_2: '18:00:00',
    } as ScheduleRow

    it('el segundo bloque esta oculto por defecto y aparece al activar el switch', async () => {
      render(<ScheduleForm shiftTypes={shiftTypes} />)

      expect(screen.queryByLabelText('Entrada del segundo bloque: hora')).not.toBeInTheDocument()

      await userEvent.click(screen.getByText(/jornada partida/i))

      expect(screen.getByLabelText('Entrada del segundo bloque: hora')).toBeInTheDocument()
      expect(screen.getByLabelText('Salida del segundo bloque: hora')).toBeInTheDocument()
    })

    it('al activarlo, sugiere un segundo bloque posterior al primero y oculta almuerzo y break', async () => {
      render(<ScheduleForm shiftTypes={shiftTypes} />)

      expect(screen.getByLabelText('Inicio de almuerzo: hora')).toBeInTheDocument()

      await userEvent.click(screen.getByText(/jornada partida/i))

      // Salida 17:00 por defecto: el segundo bloque sugerido arranca a las 19:00.
      expect(screen.getByLabelText('Entrada del segundo bloque: hora')).toHaveTextContent('19')
      expect(screen.queryByLabelText('Inicio de almuerzo: hora')).not.toBeInTheDocument()
      expect(screen.queryByText('Incluye break adicional al almuerzo')).not.toBeInTheDocument()
    })

    it('precarga el segundo bloque de una plantilla existente', () => {
      render(<ScheduleForm schedule={partida} shiftTypes={shiftTypes} />)

      expect(screen.getByLabelText('Entrada del segundo bloque: hora')).toHaveTextContent('14')
      expect(screen.getByLabelText('Salida del segundo bloque: hora')).toHaveTextContent('18')
      expect(screen.queryByLabelText('Inicio de almuerzo: hora')).not.toBeInTheDocument()
    })

    it('al guardar manda los dos bloques a updateSchedule', async () => {
      mockUpdateSchedule.mockResolvedValue({ ok: true })
      render(<ScheduleForm schedule={partida} shiftTypes={shiftTypes} />)

      await userEvent.click(screen.getByRole('button', { name: /actualizar horario/i }))

      await waitFor(() =>
        expect(mockUpdateSchedule).toHaveBeenCalledWith(
          7,
          expect.objectContaining({
            hor_hora_entrada: '08:00',
            hor_hora_salida: '12:00',
            hor_hora_entrada_2: '14:00',
            hor_hora_salida_2: '18:00',
          })
        )
      )
    })

    it('desactivar el switch limpia el segundo bloque y vuelve a mostrar el almuerzo', async () => {
      mockUpdateSchedule.mockResolvedValue({ ok: true })
      render(<ScheduleForm schedule={partida} shiftTypes={shiftTypes} />)

      await userEvent.click(screen.getByText(/jornada partida/i))

      expect(screen.queryByLabelText('Entrada del segundo bloque: hora')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Inicio de almuerzo: hora')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /actualizar horario/i }))

      await waitFor(() =>
        expect(mockUpdateSchedule).toHaveBeenCalledWith(
          7,
          expect.objectContaining({ hor_hora_entrada_2: '', hor_hora_salida_2: '' })
        )
      )
    })
  })

  describe('sucursal de cada bloque', () => {
    const sucursales = [
      { id: 10, nombre: 'Infinity' },
      { id: 20, nombre: 'Alex' },
    ]

    it('no se ofrece sin segundo bloque', () => {
      render(<ScheduleForm shiftTypes={shiftTypes} sucursales={sucursales} />)

      expect(screen.queryByLabelText('Sucursal del primer bloque')).not.toBeInTheDocument()
    })

    it('con segundo bloque ofrece una sucursal por bloque, por defecto la de la asignacion', async () => {
      render(<ScheduleForm shiftTypes={shiftTypes} sucursales={sucursales} />)

      await userEvent.click(screen.getByText(/jornada partida/i))

      expect(screen.getByLabelText('Sucursal del primer bloque')).toHaveValue('')
      expect(screen.getByLabelText('Sucursal del segundo bloque')).toHaveValue('')
      expect(screen.getAllByRole('option', { name: 'La de la asignación' })).toHaveLength(2)
    })

    it('con una sola sucursal no ofrece la eleccion', async () => {
      render(<ScheduleForm shiftTypes={shiftTypes} sucursales={[sucursales[0]]} />)

      await userEvent.click(screen.getByText(/jornada partida/i))

      expect(screen.queryByLabelText('Sucursal del primer bloque')).not.toBeInTheDocument()
    })

    it('guarda la sucursal elegida para cada bloque', async () => {
      mockCreateSchedule.mockResolvedValue({ ok: true, id: 1 })
      render(<ScheduleForm shiftTypes={shiftTypes} sucursales={sucursales} />)

      await userEvent.type(screen.getByLabelText('Nombre de la plantilla'), 'Turno Partido')
      await userEvent.click(screen.getByText(/jornada partida/i))
      await userEvent.selectOptions(screen.getByLabelText('Sucursal del primer bloque'), '10')
      await userEvent.selectOptions(screen.getByLabelText('Sucursal del segundo bloque'), '20')
      await userEvent.click(screen.getByRole('button', { name: /crear horario/i }))

      await waitFor(() =>
        expect(mockCreateSchedule).toHaveBeenCalledWith(
          expect.objectContaining({ hor_sucursal_id: 10, hor_sucursal_id_2: 20 })
        )
      )
    })

    it('no deja guardar con la sucursal de un solo bloque', async () => {
      render(<ScheduleForm shiftTypes={shiftTypes} sucursales={sucursales} />)

      await userEvent.type(screen.getByLabelText('Nombre de la plantilla'), 'Turno Partido')
      await userEvent.click(screen.getByText(/jornada partida/i))
      await userEvent.selectOptions(screen.getByLabelText('Sucursal del primer bloque'), '10')
      await userEvent.click(screen.getByRole('button', { name: /crear horario/i }))

      expect(await screen.findByText(/Elija la sucursal de los dos bloques/)).toBeInTheDocument()
      expect(mockCreateSchedule).not.toHaveBeenCalled()
    })

    it('precarga las sucursales de una plantilla existente', () => {
      const partida = {
        ...existingSchedule,
        hor_hora_salida: '12:00:00',
        hor_hora_entrada_2: '14:00:00',
        hor_hora_salida_2: '18:00:00',
        hor_sucursal_id: 20,
        hor_sucursal_id_2: 10,
      } as ScheduleRow
      render(<ScheduleForm schedule={partida} shiftTypes={shiftTypes} sucursales={sucursales} />)

      expect(screen.getByLabelText('Sucursal del primer bloque')).toHaveValue('20')
      expect(screen.getByLabelText('Sucursal del segundo bloque')).toHaveValue('10')
    })

    it('quitar la jornada partida limpia las sucursales', async () => {
      mockUpdateSchedule.mockResolvedValue({ ok: true })
      const partida = {
        ...existingSchedule,
        hor_hora_salida: '12:00:00',
        hor_hora_entrada_2: '14:00:00',
        hor_hora_salida_2: '18:00:00',
        hor_sucursal_id: 20,
        hor_sucursal_id_2: 10,
      } as ScheduleRow
      render(<ScheduleForm schedule={partida} shiftTypes={shiftTypes} sucursales={sucursales} />)

      await userEvent.click(screen.getByText(/jornada partida/i))
      await userEvent.click(screen.getByRole('button', { name: /actualizar horario/i }))

      await waitFor(() =>
        expect(mockUpdateSchedule).toHaveBeenCalledWith(
          7,
          expect.objectContaining({ hor_sucursal_id: null, hor_sucursal_id_2: null })
        )
      )
    })
  })
})
