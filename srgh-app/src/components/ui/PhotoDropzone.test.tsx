import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoDropzone } from './PhotoDropzone'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

function jpegFile(name = 'foto.jpg', size = JPEG_BYTES.length): File {
  const bytes = new Uint8Array(size)
  bytes.set(JPEG_BYTES.slice(0, Math.min(JPEG_BYTES.length, size)))
  return new File([bytes], name, { type: 'image/jpeg' })
}

describe('PhotoDropzone', () => {
  it('muestra el estado vacío cuando no hay file ni currentUrl', () => {
    render(<PhotoDropzone file={null} currentUrl={null} onSelect={vi.fn()} onClear={vi.fn()} />)

    expect(screen.getByText(/arrastrá o hacé click/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('muestra currentUrl cuando no hay file local seleccionado', () => {
    render(
      <PhotoDropzone
        file={null}
        currentUrl="https://cdn.example/actual.jpg?token=t"
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />
    )

    expect(screen.getByAltText(/vista previa/i)).toHaveAttribute(
      'src',
      'https://cdn.example/actual.jpg?token=t'
    )
    // Sin file local, no hay nada que "cancelar".
    expect(screen.queryByRole('button', { name: /quitar selección/i })).not.toBeInTheDocument()
  })

  it('un archivo válido por el input dispara onSelect', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PhotoDropzone file={null} onSelect={onSelect} onClear={vi.fn()} />)

    await user.upload(screen.getByTestId('photo-dropzone-input'), jpegFile())

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
    expect(onSelect.mock.calls[0][0]).toBeInstanceOf(File)
  })

  it('un archivo con bytes que no matchean ningún tipo se rechaza sin llamar onSelect', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PhotoDropzone file={null} onSelect={onSelect} onClear={vi.fn()} />)

    const texto = new File([new TextEncoder().encode('no soy una imagen')], 'falso.jpg', {
      type: 'image/jpeg',
    })
    await user.upload(screen.getByTestId('photo-dropzone-input'), texto)

    expect(
      await screen.findByText(/solo se permiten archivos jpg, png o webp/i)
    ).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('un archivo que excede el tamaño máximo muestra el mensaje de tamaño', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PhotoDropzone file={null} onSelect={onSelect} onClear={vi.fn()} />)

    const grande = jpegFile('grande.jpg', 5 * 1024 * 1024 + 1)
    await user.upload(screen.getByTestId('photo-dropzone-input'), grande)

    expect(await screen.findByText(/no puede superar 5 mb/i)).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('soltar un archivo válido (drag & drop) dispara onSelect', async () => {
    const onSelect = vi.fn()
    render(<PhotoDropzone file={null} onSelect={onSelect} onClear={vi.fn()} />)

    const dropzone = screen.getByRole('button', { name: /subir foto del colaborador/i })
    const file = jpegFile()

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  it('con un file seleccionado muestra "Quitar selección" y lo invoca al hacer click', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(<PhotoDropzone file={jpegFile()} onSelect={vi.fn()} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: /quitar selección/i }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('deshabilitado no abre el selector ni acepta drop', () => {
    const onSelect = vi.fn()
    render(<PhotoDropzone file={null} onSelect={onSelect} onClear={vi.fn()} disabled />)

    const dropzone = screen.getByRole('button', { name: /subir foto del colaborador/i })
    expect(dropzone).toHaveAttribute('aria-disabled', 'true')

    fireEvent.drop(dropzone, { dataTransfer: { files: [jpegFile()] } })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
