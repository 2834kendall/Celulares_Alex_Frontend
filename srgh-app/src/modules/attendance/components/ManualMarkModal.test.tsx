import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManualMarkModal } from './ManualMarkModal'
import { saveManualMark } from '@/modules/attendance/actions/saveManualMark'

vi.mock('@/modules/attendance/actions/saveManualMark', () => ({
  saveManualMark: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockSaveManualMark = vi.mocked(saveManualMark)

const baseProps = {
  employmentHistoryId: 1,
  employeeId: 10,
  employeeName: 'Ana Perez',
  sucursalId: 100,
  tipo: 'ENTRADA' as const,
  markId: null,
  currentFechaHora: null,
  defaultDateISO: '2026-07-25',
  onClose: vi.fn(),
}

describe('<ManualMarkModal />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el nombre del colaborador y el tipo de marca', () => {
    render(<ManualMarkModal {...baseProps} />)

    expect(screen.getByText(/Ana Perez/)).toBeInTheDocument()
    expect(screen.getByText(/Entrada/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agregar marca' })).toBeInTheDocument()
  })

  it('muestra "Corregir marca" cuando markId no es null', () => {
    render(<ManualMarkModal {...baseProps} markId={5} currentFechaHora="2026-07-25 08:04:00" />)

    expect(screen.getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
  })

  it('rechaza el envio con justificacion demasiado corta, sin llamar la action', async () => {
    const user = userEvent.setup()
    render(<ManualMarkModal {...baseProps} />)

    await user.type(screen.getByLabelText('Justificacion (obligatoria)'), 'corto')
    await user.click(screen.getByRole('button', { name: 'Agregar marca' }))

    expect(mockSaveManualMark).not.toHaveBeenCalled()
    expect(
      screen.getByText('Escriba una justificacion de al menos 10 caracteres.')
    ).toBeInTheDocument()
  })

  it('envia los datos correctos y llama onSuccess/onClose en exito', async () => {
    mockSaveManualMark.mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(<ManualMarkModal {...baseProps} onClose={onClose} onSuccess={onSuccess} />)

    await user.type(
      screen.getByLabelText('Justificacion (obligatoria)'),
      'La tablet del kiosco no encendio esta mañana.'
    )
    await user.click(screen.getByRole('button', { name: 'Agregar marca' }))

    await waitFor(() => expect(mockSaveManualMark).toHaveBeenCalled())

    expect(mockSaveManualMark).toHaveBeenCalledWith(
      expect.objectContaining({
        markId: null,
        employmentHistoryId: 1,
        employeeId: 10,
        sucursalId: 100,
        tipo: 'ENTRADA',
        fecha: '2026-07-25',
        hora: '08:00',
        observacion: 'La tablet del kiosco no encendio esta mañana.',
      })
    )
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra el error del servidor sin cerrar el modal cuando la action falla', async () => {
    mockSaveManualMark.mockResolvedValue({ ok: false, error: 'No se pudo guardar la marca.' })
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<ManualMarkModal {...baseProps} onClose={onClose} />)

    await user.type(
      screen.getByLabelText('Justificacion (obligatoria)'),
      'La tablet del kiosco no encendio esta mañana.'
    )
    await user.click(screen.getByRole('button', { name: 'Agregar marca' }))

    expect(await screen.findByText('No se pudo guardar la marca.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('prellena fecha y hora a partir de la marca actual cuando se esta corrigiendo', () => {
    render(<ManualMarkModal {...baseProps} markId={5} currentFechaHora="2026-07-25 08:04:00" />)

    expect(screen.getByLabelText('Fecha del evento')).toHaveValue('2026-07-25')
  })
})
