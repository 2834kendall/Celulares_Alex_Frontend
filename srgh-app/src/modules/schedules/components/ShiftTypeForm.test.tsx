import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShiftTypeForm } from './ShiftTypeForm'
import { createShiftType } from '@/modules/schedules/actions/createShiftType'
import { updateShiftType } from '@/modules/schedules/actions/updateShiftType'
import type { ShiftTypeRow } from '@/modules/schedules/types'

vi.mock('@/modules/schedules/actions/createShiftType', () => ({ createShiftType: vi.fn() }))
vi.mock('@/modules/schedules/actions/updateShiftType', () => ({ updateShiftType: vi.fn() }))

const mockCreateShiftType = vi.mocked(createShiftType)
const mockUpdateShiftType = vi.mocked(updateShiftType)

const existingShiftType = {
  tjo_id: 3,
  tjo_codigo: 'JORNADA_MIXTA',
  tjo_nombre: 'Jornada Mixta',
  tjo_horas_max_diarias: 8,
  tjo_horas_max_semanales: 48,
  tjo_recargo_porcentaje: 25,
} as ShiftTypeRow

describe('<ShiftTypeForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('modo creacion: llama a createShiftType con los datos del formulario', async () => {
    mockCreateShiftType.mockResolvedValue({ ok: true, id: 1 })
    const onSuccess = vi.fn()
    render(<ShiftTypeForm onSuccess={onSuccess} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Código'), 'JORNADA_NOCTURNA')
    await user.type(screen.getByLabelText('Nombre'), 'Jornada Nocturna')
    await user.click(screen.getByRole('button', { name: /crear tipo de jornada/i }))

    await waitFor(() =>
      expect(mockCreateShiftType).toHaveBeenCalledWith(
        expect.objectContaining({ tjo_codigo: 'JORNADA_NOCTURNA', tjo_nombre: 'Jornada Nocturna' })
      )
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('modo edicion: precarga valores y llama a updateShiftType con el id', async () => {
    mockUpdateShiftType.mockResolvedValue({ ok: true })
    render(<ShiftTypeForm shiftType={existingShiftType} />)

    expect(screen.getByDisplayValue('JORNADA_MIXTA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /actualizar tipo de jornada/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /actualizar tipo de jornada/i }))

    await waitFor(() =>
      expect(mockUpdateShiftType).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ tjo_codigo: 'JORNADA_MIXTA' })
      )
    )
  })

  it('rechaza un codigo en minusculas', async () => {
    render(<ShiftTypeForm />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Código'), 'jornada_mixta')
    await user.type(screen.getByLabelText('Nombre'), 'Jornada Mixta')
    await user.click(screen.getByRole('button', { name: /crear tipo de jornada/i }))

    expect(await screen.findByText(/mayusculas/i)).toBeInTheDocument()
    expect(mockCreateShiftType).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor cuando la action falla', async () => {
    mockCreateShiftType.mockResolvedValue({
      ok: false,
      error: 'No se pudo crear el tipo de jornada. Verifique que el codigo no este repetido.',
    })
    render(<ShiftTypeForm />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Código'), 'JORNADA_MIXTA')
    await user.type(screen.getByLabelText('Nombre'), 'Jornada Mixta')
    await user.click(screen.getByRole('button', { name: /crear tipo de jornada/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('codigo no este repetido')
  })
})
