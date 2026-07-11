import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShiftTypesList } from './ShiftTypesList'
import { deleteShiftType } from '@/modules/schedules/actions/deleteShiftType'
import type { ShiftType } from '@/modules/schedules/actions/getShiftTypes'

vi.mock('@/modules/schedules/actions/deleteShiftType', () => ({ deleteShiftType: vi.fn() }))
vi.mock('@/modules/schedules/actions/createShiftType', () => ({ createShiftType: vi.fn() }))
vi.mock('@/modules/schedules/actions/updateShiftType', () => ({ updateShiftType: vi.fn() }))

const mockDeleteShiftType = vi.mocked(deleteShiftType)

function makeShiftType(overrides: Partial<ShiftType> = {}): ShiftType {
  return {
    tjo_id: 1,
    tjo_codigo: 'DIURNA',
    tjo_nombre: 'Diurna',
    tjo_horas_max_diarias: 8,
    tjo_horas_max_semanales: 48,
    tjo_recargo_porcentaje: 0,
    ...overrides,
  } as ShiftType
}

describe('<ShiftTypesList />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio cuando no hay tipos de jornada', () => {
    render(<ShiftTypesList shiftTypes={[]} canWrite={true} />)
    expect(screen.getByText('No hay tipos de jornada')).toBeInTheDocument()
  })

  it('lista los tipos de jornada con sus horas y recargo', () => {
    render(<ShiftTypesList shiftTypes={[makeShiftType()]} canWrite={true} />)

    expect(screen.getByText('DIURNA')).toBeInTheDocument()
    expect(screen.getByText('Diurna')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('muestra "—" cuando no hay limite de horas', () => {
    render(
      <ShiftTypesList
        shiftTypes={[makeShiftType({ tjo_horas_max_diarias: null, tjo_horas_max_semanales: null })]}
        canWrite={true}
      />
    )

    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('oculta las acciones de escritura cuando canWrite es false', () => {
    render(<ShiftTypesList shiftTypes={[makeShiftType()]} canWrite={false} />)

    expect(screen.queryByRole('button', { name: /nuevo tipo de jornada/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Editar')).not.toBeInTheDocument()
  })

  it('abre el formulario de edicion con los valores existentes', async () => {
    render(<ShiftTypesList shiftTypes={[makeShiftType()]} canWrite={true} />)

    await userEvent.click(screen.getByLabelText('Editar'))

    expect(screen.getByRole('heading', { name: 'Editar: Diurna' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('DIURNA')).toBeInTheDocument()
  })

  it('confirma y elimina un tipo de jornada', async () => {
    mockDeleteShiftType.mockResolvedValue({ ok: true })
    render(<ShiftTypesList shiftTypes={[makeShiftType()]} canWrite={true} />)

    await userEvent.click(screen.getByLabelText('Eliminar'))
    const dialog = screen.getByRole('alertdialog')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(mockDeleteShiftType).toHaveBeenCalledWith(1))
  })

  it('muestra el error del servidor cuando la eliminacion falla', async () => {
    mockDeleteShiftType.mockResolvedValue({ ok: false, error: 'En uso por un horario.' })
    render(<ShiftTypesList shiftTypes={[makeShiftType()]} canWrite={true} />)

    await userEvent.click(screen.getByLabelText('Eliminar'))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('En uso por un horario.')
  })
})
