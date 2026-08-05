import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EnrollScreen } from './EnrollScreen'
import { enrollFace } from '@/modules/attendance/actions/enrollFace'
import type { FaceScanProps } from './FaceScan'

vi.mock('@/modules/attendance/actions/enrollFace', () => ({ enrollFace: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

let faceScanProps: FaceScanProps | null = null
vi.mock('./FaceScan', () => ({
  FaceScan: (props: FaceScanProps) => {
    faceScanProps = props
    return <div data-testid="face-scan" />
  },
}))

const mockEnrollFace = vi.mocked(enrollFace)

const employees = [
  { employeeId: 10, fullName: 'Ana Perez', birthDateISO: '1990-01-01' },
  { employeeId: 20, fullName: 'Bruno Mora', birthDateISO: null },
]

const PAYLOAD = { iv: 'aXY=', data: 'ZGF0YQ==' }

describe('<EnrollScreen />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    faceScanProps = null
  })

  it('no muestra la camara hasta elegir colaborador y presionar capturar', async () => {
    const user = userEvent.setup()
    render(<EnrollScreen employees={employees} enrolledIds={[]} />)

    expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Selecciona al colaborador'))
    await user.click(screen.getByText('Ana Perez'))
    await user.click(screen.getByRole('button', { name: /Capturar rostro/ }))

    expect(screen.getByTestId('face-scan')).toBeInTheDocument()
  })

  it('marca a los ya enrolados y avisa que re-capturar reemplaza', async () => {
    const user = userEvent.setup()
    render(<EnrollScreen employees={employees} enrolledIds={[10]} />)

    await user.click(screen.getByLabelText('Selecciona al colaborador'))
    await user.click(screen.getByText('Ana Perez (ya enrolado)'))

    expect(screen.getByText(/capturar de nuevo lo reemplaza/)).toBeInTheDocument()
  })

  it('envia el vector cifrado a enrollFace y muestra la confirmacion', async () => {
    mockEnrollFace.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(<EnrollScreen employees={employees} enrolledIds={[]} />)

    await user.click(screen.getByLabelText('Selecciona al colaborador'))
    await user.click(screen.getByText('Ana Perez'))
    await user.click(screen.getByRole('button', { name: /Capturar rostro/ }))

    await act(async () => {
      await faceScanProps!.onEmbedding(PAYLOAD)
    })

    expect(mockEnrollFace).toHaveBeenCalledWith({ employeeId: 10, vector: PAYLOAD })
    expect(screen.getByText('Rostro registrado')).toBeInTheDocument()
    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
  })

  it('si enrollFace falla, vuelve a la pantalla de captura sin confirmar', async () => {
    mockEnrollFace.mockResolvedValue({ ok: false, error: 'No se pudo guardar el registro facial.' })
    const user = userEvent.setup()

    render(<EnrollScreen employees={employees} enrolledIds={[]} />)

    await user.click(screen.getByLabelText('Selecciona al colaborador'))
    await user.click(screen.getByText('Ana Perez'))
    await user.click(screen.getByRole('button', { name: /Capturar rostro/ }))

    await act(async () => {
      await faceScanProps!.onEmbedding(PAYLOAD)
    })

    expect(screen.queryByText('Rostro registrado')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Capturar rostro/ })).toBeInTheDocument()
  })
})
