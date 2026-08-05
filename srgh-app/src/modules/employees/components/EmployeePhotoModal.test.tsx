import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { EmployeePhotoModal } from './EmployeePhotoModal'
import { setEmployeePhoto } from '@/modules/employees/actions/setEmployeePhoto'
import { removeEmployeePhoto } from '@/modules/employees/actions/removeEmployeePhoto'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}))

vi.mock('@/modules/employees/actions/setEmployeePhoto', () => ({
  setEmployeePhoto: vi.fn(),
}))
vi.mock('@/modules/employees/actions/removeEmployeePhoto', () => ({
  removeEmployeePhoto: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockSetEmployeePhoto = vi.mocked(setEmployeePhoto)
const mockRemoveEmployeePhoto = vi.mocked(removeEmployeePhoto)
const mockToastSuccess = vi.mocked(toast.success)

function jpegFile(name = 'foto.jpg'): File {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
  return new File([bytes], name, { type: 'image/jpeg' })
}

describe('<EmployeePhotoModal />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el botón Guardar arranca deshabilitado sin foto elegida', () => {
    render(<EmployeePhotoModal empId={10} currentUrl={null} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
  })

  it('sin foto guardada no muestra "Quitar foto"', () => {
    render(<EmployeePhotoModal empId={10} currentUrl={null} onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /quitar foto/i })).not.toBeInTheDocument()
  })

  it('con foto guardada (y sin selección nueva) muestra "Quitar foto"', () => {
    render(
      <EmployeePhotoModal
        empId={10}
        currentUrl="https://cdn/actual.jpg?token=t"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /quitar foto/i })).toBeInTheDocument()
  })

  it('elegir una foto habilita Guardar; al guardar llama setEmployeePhoto, refresca y cierra', async () => {
    mockSetEmployeePhoto.mockResolvedValue({ ok: true, path: '1/empleados/10/x.jpg' })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<EmployeePhotoModal empId={10} currentUrl={null} onClose={onClose} />)

    await user.upload(screen.getByTestId('photo-dropzone-input'), jpegFile())
    expect(screen.getByRole('button', { name: /guardar/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(mockSetEmployeePhoto).toHaveBeenCalledTimes(1)
    })
    const [empId, formData] = mockSetEmployeePhoto.mock.calls[0]
    expect(empId).toBe(10)
    expect(formData.get('file')).toBeInstanceOf(File)
    expect(mockToastSuccess).toHaveBeenCalledWith('Foto actualizada.')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('si setEmployeePhoto falla, muestra el error y NO cierra', async () => {
    mockSetEmployeePhoto.mockResolvedValue({
      ok: false,
      error: 'El archivo supera el tamaño máximo permitido.',
    })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<EmployeePhotoModal empId={10} currentUrl={null} onClose={onClose} />)

    await user.upload(screen.getByTestId('photo-dropzone-input'), jpegFile())
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/supera el tamaño/i)
    expect(onClose).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('"Quitar foto" pide confirmación antes de llamar removeEmployeePhoto', async () => {
    mockRemoveEmployeePhoto.mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <EmployeePhotoModal
        empId={10}
        currentUrl="https://cdn/actual.jpg?token=t"
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /quitar foto/i }))
    expect(mockRemoveEmployeePhoto).not.toHaveBeenCalled()
    expect(screen.getByText('¿Quitar la foto?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quitar' }))

    await waitFor(() => {
      expect(mockRemoveEmployeePhoto).toHaveBeenCalledWith(10)
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Foto eliminada.')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancelar la confirmación no llama removeEmployeePhoto', async () => {
    const user = userEvent.setup()
    render(
      <EmployeePhotoModal
        empId={10}
        currentUrl="https://cdn/actual.jpg?token=t"
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /quitar foto/i }))
    // Hay dos botones "Cancelar" en pantalla (el del modal y el de la
    // confirmación): se acota al alertdialog para no ser ambiguo.
    const confirmDialog = screen.getByRole('alertdialog')
    await user.click(within(confirmDialog).getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByText('¿Quitar la foto?')).not.toBeInTheDocument()
    expect(mockRemoveEmployeePhoto).not.toHaveBeenCalled()
  })

  it('el botón Cancelar del modal cierra sin llamar a ninguna action', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<EmployeePhotoModal empId={10} currentUrl={null} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockSetEmployeePhoto).not.toHaveBeenCalled()
    expect(mockRemoveEmployeePhoto).not.toHaveBeenCalled()
  })
})
