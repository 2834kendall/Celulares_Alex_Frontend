import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { redirect } from 'next/navigation'
import { ImageUploadModal } from './ImageUploadModal'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Elegir el archivo no es lo que se prueba: la validación vive en el dropzone.
vi.mock('@/components/ui/PhotoDropzone', () => ({
  PhotoDropzone: ({ onSelect }: { onSelect: (file: File) => void }) => (
    <button type="button" onClick={() => onSelect(new File(['x'], 'logo.png'))}>
      Elegir archivo
    </button>
  ),
}))

const onSave = vi.fn()
const onRemove = vi.fn()
const onClose = vi.fn()

const COPY = {
  saved: 'Logo actualizado.',
  removed: 'Logo eliminado.',
  removeAction: 'Quitar logo',
  removeConfirmTitle: '¿Quitar el logo?',
  removeConfirmMessage: 'Vuelve el logo de la empresa.',
}

function renderModal(currentUrl: string | null = null) {
  render(
    <ImageUploadModal
      title="Logo"
      currentUrl={currentUrl}
      onClose={onClose}
      onSave={onSave}
      onRemove={onRemove}
      copy={COPY}
    />
  )
}

const guardar = () => screen.getByRole('button', { name: 'Guardar' })
const cancelar = () => screen.getByRole('button', { name: 'Cancelar' })

function errorDeRedireccion(): unknown {
  try {
    redirect('/unauthorized')
  } catch (error) {
    return error
  }
}

async function elegirYGuardar() {
  await userEvent.click(screen.getByRole('button', { name: 'Elegir archivo' }))
  await userEvent.click(guardar())
}

async function quitarYConfirmar() {
  await userEvent.click(screen.getByRole('button', { name: COPY.removeAction }))
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Quitar' })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onSave.mockResolvedValue({ ok: true })
  onRemove.mockResolvedValue({ ok: true })
})

describe('ImageUploadModal — guardar', () => {
  it('sube el archivo elegido, avisa y cierra', async () => {
    renderModal()
    await elegirYGuardar()

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].get('file')).toBeInstanceOf(File)
    expect(toast.success).toHaveBeenCalledWith(COPY.saved)
  })

  it('muestra el error de la acción y no cierra', async () => {
    onSave.mockResolvedValue({ ok: false, error: 'Archivo inválido.' })
    renderModal()
    await elegirYGuardar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Archivo inválido.')
    expect(onClose).not.toHaveBeenCalled()
  })

  // Con `busy` pegado en true, Cancelar y la X quedaban sin salida hasta recargar.
  it('si se cae la red, avisa, conserva el archivo y no queda trabado', async () => {
    onSave.mockRejectedValue(new TypeError('Failed to fetch'))
    renderModal()
    await elegirYGuardar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá la conexión')
    expect(guardar()).toBeEnabled()
    expect(cancelar()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('una redirección no se informa como falla', async () => {
    onSave.mockRejectedValue(errorDeRedireccion())
    renderModal()
    await elegirYGuardar()

    await waitFor(() => expect(cancelar()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ImageUploadModal — quitar', () => {
  it('quita después de confirmar, avisa y cierra', async () => {
    renderModal('https://firmada/logo')
    await quitarYConfirmar()

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith(COPY.removed)
  })

  it('si se cae la red, avisa, cierra la confirmación y no queda trabado', async () => {
    onRemove.mockRejectedValue(new TypeError('Failed to fetch'))
    renderModal('https://firmada/logo')
    await quitarYConfirmar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá la conexión')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(cancelar()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('una redirección no se informa como falla', async () => {
    onRemove.mockRejectedValue(errorDeRedireccion())
    renderModal('https://firmada/logo')
    await quitarYConfirmar()

    await waitFor(() => expect(cancelar()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
