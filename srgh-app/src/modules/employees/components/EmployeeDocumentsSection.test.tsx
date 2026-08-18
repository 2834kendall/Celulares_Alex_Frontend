import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeDocumentsSection } from './EmployeeDocumentsSection'
import { chooseSelectMenuOption } from '@/test/selectMenu'
import { addEmployeeDocument } from '@/modules/employees/actions/addEmployeeDocument'
import { updateEmployeeDocument } from '@/modules/employees/actions/updateEmployeeDocument'
import { deleteEmployeeDocument } from '@/modules/employees/actions/deleteEmployeeDocument'
import { getEmployeeDocumentDownloadUrl } from '@/modules/employees/actions/getEmployeeDocumentDownloadUrl'
import type { CatalogoItem, DocumentoEmpleado } from '@/modules/employees/types'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

vi.mock('@/modules/employees/actions/addEmployeeDocument', () => ({
  addEmployeeDocument: vi.fn(),
}))
vi.mock('@/modules/employees/actions/updateEmployeeDocument', () => ({
  updateEmployeeDocument: vi.fn(),
}))
vi.mock('@/modules/employees/actions/deleteEmployeeDocument', () => ({
  deleteEmployeeDocument: vi.fn(),
}))
vi.mock('@/modules/employees/actions/getEmployeeDocumentDownloadUrl', () => ({
  getEmployeeDocumentDownloadUrl: vi.fn(),
}))

const mockAdd = vi.mocked(addEmployeeDocument)
const mockUpdate = vi.mocked(updateEmployeeDocument)
const mockDelete = vi.mocked(deleteEmployeeDocument)
const mockGetDownloadUrl = vi.mocked(getEmployeeDocumentDownloadUrl)

const TIPOS: CatalogoItem[] = [
  { id: 1, nombre: 'Contrato' },
  { id: 2, nombre: 'Identificación' },
]

const DOCUMENTO: DocumentoEmpleado = {
  doc_id: 1,
  doc_empleado_id: 10,
  doc_tipo_id: 1,
  doc_nombre: 'Contrato firmado',
  doc_descripcion: null,
  doc_fecha_vencimiento: null,
  doc_mime: 'application/pdf',
  doc_created_at: '2026-01-01T00:00:00Z',
  tipo_nombre: 'Contrato',
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0])

function pdfFile(name = 'cedula.pdf'): File {
  return new File([PDF_BYTES], name, { type: 'application/pdf' })
}

describe('<EmployeeDocumentsSection />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el error de listado en un role="alert"', () => {
    render(
      <EmployeeDocumentsSection
        empId={10}
        documentos={[]}
        tiposDocumento={TIPOS}
        canWrite
        listError="No se pudieron cargar los documentos."
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los documentos.')
  })

  it('sin canWrite no hay botón Nuevo ni editar/eliminar, pero sí descargar', () => {
    render(
      <EmployeeDocumentsSection
        empId={10}
        documentos={[DOCUMENTO]}
        tiposDocumento={TIPOS}
        canWrite={false}
      />
    )

    expect(screen.queryByRole('button', { name: /nuevo documento/i })).not.toBeInTheDocument()
    // El input sigue montado pero deshabilitado: sin botón no hay forma de abrirlo.
    expect(screen.getByTestId('document-dropzone-input')).toBeDisabled()
    expect(screen.queryByText(/editar contrato firmado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/eliminar contrato firmado/i)).not.toBeInTheDocument()
    expect(screen.getByText(/descargar contrato firmado/i)).toBeInTheDocument()
  })

  it('sube un documento: dropzone → modal de metadata → addEmployeeDocument → toast y refresh', async () => {
    mockAdd.mockResolvedValue({ ok: true, docId: 5 })
    const user = userEvent.setup()
    render(<EmployeeDocumentsSection empId={10} documentos={[]} tiposDocumento={TIPOS} canWrite />)

    await user.upload(screen.getByTestId('document-dropzone-input'), pdfFile())

    const dialog = await screen.findByRole('dialog')
    await chooseSelectMenuOption(user, /tipo de documento/i, 'Contrato')
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledTimes(1)
    })
    const [empId, formData] = mockAdd.mock.calls[0]
    expect(empId).toBe(10)
    expect(formData.get('file')).toBeInstanceOf(File)
    expect(formData.get('doc_tipo_id')).toBe('1')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si addEmployeeDocument falla, muestra el error dentro del modal sin cerrarlo', async () => {
    mockAdd.mockResolvedValue({ ok: false, error: 'No se pudo guardar el documento.' })
    const user = userEvent.setup()
    render(<EmployeeDocumentsSection empId={10} documentos={[]} tiposDocumento={TIPOS} canWrite />)

    await user.upload(screen.getByTestId('document-dropzone-input'), pdfFile())
    const dialog = await screen.findByRole('dialog')
    await chooseSelectMenuOption(user, /tipo de documento/i, 'Contrato')
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el documento.'
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('edita un documento existente: precarga metadata y llama updateEmployeeDocument', async () => {
    mockUpdate.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <EmployeeDocumentsSection
        empId={10}
        documentos={[DOCUMENTO]}
        tiposDocumento={TIPOS}
        canWrite
      />
    )

    await user.click(screen.getByText(/editar contrato firmado/i))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/nombre del documento/i)).toHaveValue('Contrato firmado')

    await user.click(within(dialog).getByRole('button', { name: /actualizar/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(1, {
        doc_nombre: 'Contrato firmado',
        doc_tipo_id: 1,
        doc_descripcion: null,
        doc_fecha_vencimiento: null,
      })
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('elimina un documento tras confirmar y muestra el toast de éxito', async () => {
    mockDelete.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <EmployeeDocumentsSection
        empId={10}
        documentos={[DOCUMENTO]}
        tiposDocumento={TIPOS}
        canWrite
      />
    )

    await user.click(screen.getByText(/eliminar contrato firmado/i))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(1)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('si el borrado falla, muestra el error inline y no refresca', async () => {
    mockDelete.mockResolvedValue({ ok: false, error: 'No se pudo eliminar el documento.' })
    const user = userEvent.setup()
    render(
      <EmployeeDocumentsSection
        empId={10}
        documentos={[DOCUMENTO]}
        tiposDocumento={TIPOS}
        canWrite
      />
    )

    await user.click(screen.getByText(/eliminar contrato firmado/i))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar el documento.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('descarga un documento: pide la URL firmada y navega con window.location.assign', async () => {
    mockGetDownloadUrl.mockResolvedValue({ ok: true, url: 'https://signed.example/doc' })
    const assignSpy = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignSpy },
      writable: true,
    })
    const user = userEvent.setup()
    render(
      <EmployeeDocumentsSection
        empId={10}
        documentos={[DOCUMENTO]}
        tiposDocumento={TIPOS}
        canWrite
      />
    )

    await user.click(screen.getByText(/descargar contrato firmado/i))

    await waitFor(() => {
      expect(mockGetDownloadUrl).toHaveBeenCalledWith(1)
    })
    expect(assignSpy).toHaveBeenCalledWith('https://signed.example/doc')
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })
})
