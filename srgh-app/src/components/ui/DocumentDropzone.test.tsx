import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentDropzone } from './DocumentDropzone'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0])

function pdfFile(name = 'contrato.pdf', size = PDF_BYTES.length): File {
  const bytes = new Uint8Array(size)
  bytes.set(PDF_BYTES.slice(0, Math.min(PDF_BYTES.length, size)))
  return new File([bytes], name, { type: 'application/pdf' })
}

function renderDropzone(props: Partial<React.ComponentProps<typeof DocumentDropzone>> = {}) {
  return render(
    <DocumentDropzone onSelect={vi.fn()} {...props}>
      <p>Grilla de documentos</p>
    </DocumentDropzone>
  )
}

describe('DocumentDropzone', () => {
  it('renderiza el botón Nuevo y el contenido que envuelve', () => {
    renderDropzone()

    expect(screen.getByRole('button', { name: /nuevo documento/i })).toBeInTheDocument()
    expect(screen.getByText('Grilla de documentos')).toBeInTheDocument()
  })

  it('acepta una etiqueta y un encabezado propios', () => {
    renderDropzone({ triggerLabel: 'Agregar', header: <h2>Documentos del expediente</h2> })

    expect(screen.getByRole('button', { name: /agregar/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Documentos del expediente' })).toBeInTheDocument()
  })

  it('un archivo válido por el input dispara onSelect', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderDropzone({ onSelect })

    await user.upload(screen.getByTestId('document-dropzone-input'), pdfFile())

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
    expect(onSelect.mock.calls[0][0]).toBeInstanceOf(File)
  })

  it('varios archivos válidos disparan onSelect una vez por archivo', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderDropzone({ onSelect })

    await user.upload(screen.getByTestId('document-dropzone-input'), [
      pdfFile('a.pdf'),
      pdfFile('b.pdf'),
    ])

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(2)
    })
  })

  it('un archivo con bytes que no matchean ningún tipo se rechaza sin llamar onSelect', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderDropzone({ onSelect })

    const texto = new File([new TextEncoder().encode('no soy un pdf')], 'falso.pdf', {
      type: 'application/pdf',
    })
    await user.upload(screen.getByTestId('document-dropzone-input'), texto)

    expect(await screen.findByText(/solo se permiten archivos pdf, jpg o png/i)).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('un archivo que excede el tamaño máximo muestra el mensaje de tamaño', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderDropzone({ onSelect })

    await user.upload(
      screen.getByTestId('document-dropzone-input'),
      pdfFile('grande.pdf', 10 * 1024 * 1024 + 1)
    )

    expect(await screen.findByText(/no puede superar 10 mb/i)).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('soltar un archivo válido sobre el área dispara onSelect', async () => {
    const onSelect = vi.fn()
    renderDropzone({ onSelect })

    fireEvent.drop(screen.getByText('Grilla de documentos').parentElement!, {
      dataTransfer: { files: [pdfFile()] },
    })

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  it('deshabilitado no muestra el botón ni acepta drop, pero conserva el contenido', () => {
    const onSelect = vi.fn()
    renderDropzone({ onSelect, disabled: true })

    expect(screen.queryByRole('button', { name: /nuevo documento/i })).not.toBeInTheDocument()
    expect(screen.getByText('Grilla de documentos')).toBeInTheDocument()

    fireEvent.drop(screen.getByText('Grilla de documentos').parentElement!, {
      dataTransfer: { files: [pdfFile()] },
    })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
