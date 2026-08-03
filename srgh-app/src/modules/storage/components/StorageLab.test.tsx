import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { StorageLab } from './StorageLab'
import { uploadLabImage } from '@/modules/storage/actions/uploadLabImage'
import { uploadLabDocument } from '@/modules/storage/actions/uploadLabDocument'
import { getLabFileUrl } from '@/modules/storage/actions/getLabFileUrl'
import { getLabDocumentDownloadUrl } from '@/modules/storage/actions/getLabDocumentDownloadUrl'
import { removeLabFile } from '@/modules/storage/actions/removeLabFile'
import { removeLabDocument } from '@/modules/storage/actions/removeLabDocument'
import type { ArchivoLabItem, DocumentoLabItem } from '@/modules/storage/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/storage/actions/uploadLabImage', () => ({ uploadLabImage: vi.fn() }))
vi.mock('@/modules/storage/actions/uploadLabDocument', () => ({ uploadLabDocument: vi.fn() }))
vi.mock('@/modules/storage/actions/getLabFileUrl', () => ({ getLabFileUrl: vi.fn() }))
vi.mock('@/modules/storage/actions/getLabDocumentDownloadUrl', () => ({
  getLabDocumentDownloadUrl: vi.fn(),
}))
vi.mock('@/modules/storage/actions/removeLabFile', () => ({ removeLabFile: vi.fn() }))
vi.mock('@/modules/storage/actions/removeLabDocument', () => ({ removeLabDocument: vi.fn() }))

const mockUploadImage = vi.mocked(uploadLabImage)
const mockUploadDocument = vi.mocked(uploadLabDocument)
const mockGetUrl = vi.mocked(getLabFileUrl)
const mockGetDownloadUrl = vi.mocked(getLabDocumentDownloadUrl)
const mockRemoveImage = vi.mocked(removeLabFile)
const mockRemoveDocument = vi.mocked(removeLabDocument)
const mockToastSuccess = vi.mocked(toast.success)

const FOTO: ArchivoLabItem = {
  path: '1/_lab/abc.jpg',
  url: 'https://cdn.example/abc?token=t',
  sizeBytes: 2048,
  contentType: 'image/jpeg',
  createdAt: '2026-07-31T12:00:00Z',
}

const DOCUMENTO: DocumentoLabItem = {
  path: '1/_lab/doc1.pdf',
  sizeBytes: 4096,
  contentType: 'application/pdf',
  createdAt: '2026-07-31T12:00:00Z',
}

function renderLab(
  overrides: Partial<React.ComponentProps<typeof StorageLab>> = {}
): ReturnType<typeof render> {
  return render(
    <StorageLab items={[]} listError={null} documents={[]} documentsError={null} {...overrides} />
  )
}

describe('StorageLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra los vacíos de ambas secciones cuando no hay archivos', () => {
    renderLab()

    expect(screen.getByText(/no hay archivos en el laboratorio/i)).toBeInTheDocument()
    expect(screen.getByText(/no hay documentos en el laboratorio/i)).toBeInTheDocument()
  })

  it('muestra el error de listado de fotos como alerta', () => {
    renderLab({ listError: 'No tienes permiso para acceder a este archivo.' })

    expect(screen.getByRole('alert')).toHaveTextContent(/no tienes permiso/i)
  })

  it('muestra el error de listado de documentos como alerta', () => {
    renderLab({ documentsError: 'No se pudo completar la operación con el archivo.' })

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo completar/i)
  })

  // ─── Fotos (fase 1A) ────────────────────────────────────────────────────

  it('renderiza cada foto con su miniatura firmada, tamaño y nombre', () => {
    renderLab({ items: [FOTO] })

    const img = screen.getByAltText('Archivo abc.jpg')
    expect(img).toHaveAttribute('src', FOTO.url)
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('abc.jpg')).toBeInTheDocument()
  })

  it('sube la imagen elegida y muestra toast de éxito', async () => {
    mockUploadImage.mockResolvedValue({ ok: true, path: '1/_lab/nueva.jpg' })
    const user = userEvent.setup()
    renderLab()

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'foto.jpg', {
      type: 'image/jpeg',
    })
    await user.upload(screen.getByTestId('storage-lab-file-input'), file)

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledTimes(1)
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Imagen subida al laboratorio.')
  })

  it('muestra el error del servidor al fallar la subida de imagen', async () => {
    mockUploadImage.mockResolvedValue({ ok: false, error: 'El tipo de archivo no está permitido.' })
    const user = userEvent.setup()
    renderLab()

    const file = new File(['texto'], 'falso.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByTestId('storage-lab-file-input'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/tipo de archivo/i)
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('"Ver" pide una firma fresca y abre la URL', async () => {
    mockGetUrl.mockResolvedValue({ ok: true, url: 'https://cdn.example/fresca?token=t2' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    renderLab({ items: [FOTO] })

    await user.click(screen.getByRole('button', { name: /ver abc\.jpg/i }))

    await waitFor(() => {
      expect(mockGetUrl).toHaveBeenCalledWith(FOTO.path)
    })
    expect(openSpy).toHaveBeenCalledWith(
      'https://cdn.example/fresca?token=t2',
      '_blank',
      'noopener,noreferrer'
    )
    openSpy.mockRestore()
  })

  it('borra una foto y muestra toast', async () => {
    mockRemoveImage.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderLab({ items: [FOTO] })

    await user.click(screen.getByRole('button', { name: /eliminar abc\.jpg/i }))

    await waitFor(() => {
      expect(mockRemoveImage).toHaveBeenCalledWith(FOTO.path)
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Archivo eliminado.')
  })

  // ─── Documentos (fase 1B) ───────────────────────────────────────────────

  it('renderiza cada documento con nombre y tamaño, SIN <img> inline', () => {
    renderLab({ documents: [DOCUMENTO] })

    expect(screen.getByText('doc1.pdf')).toBeInTheDocument()
    expect(screen.getByText('4.0 KB')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('sube un documento, muestra el nombre sanitizado y toast', async () => {
    mockUploadDocument.mockResolvedValue({
      ok: true,
      path: '1/_lab/nuevo.pdf',
      fileName: 'contrato firmado.pdf',
    })
    const user = userEvent.setup()
    renderLab({ documents: [{ ...DOCUMENTO, path: '1/_lab/nuevo.pdf' }] })

    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const file = new File([bytes], 'contrato firmado.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByTestId('storage-lab-document-input'), file)

    await waitFor(() => {
      expect(mockUploadDocument).toHaveBeenCalledTimes(1)
    })
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Documento "contrato firmado.pdf" subido al laboratorio.'
    )
    // El nombre sanitizado reemplaza al UUID en la lista (estado local).
    expect(await screen.findByText('contrato firmado.pdf')).toBeInTheDocument()
  })

  it('muestra el error del servidor al fallar la subida de documento', async () => {
    mockUploadDocument.mockResolvedValue({
      ok: false,
      error: 'El archivo supera el tamaño máximo permitido.',
    })
    const user = userEvent.setup()
    renderLab()

    const file = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByTestId('storage-lab-document-input'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/supera el tamaño/i)
  })

  it('"Descargar" pide la URL de descarga forzada con path y nombre, y navega', async () => {
    mockGetDownloadUrl.mockResolvedValue({ ok: true, url: 'https://cdn/d?token=t&download=x' })
    const assignSpy = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignSpy },
      writable: true,
    })
    const user = userEvent.setup()
    renderLab({ documents: [DOCUMENTO] })

    await user.click(screen.getByRole('button', { name: /descargar doc1\.pdf/i }))

    await waitFor(() => {
      expect(mockGetDownloadUrl).toHaveBeenCalledWith(DOCUMENTO.path, 'doc1.pdf')
    })
    expect(assignSpy).toHaveBeenCalledWith('https://cdn/d?token=t&download=x')
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('borra un documento y muestra toast', async () => {
    mockRemoveDocument.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderLab({ documents: [DOCUMENTO] })

    await user.click(screen.getByRole('button', { name: /eliminar doc1\.pdf/i }))

    await waitFor(() => {
      expect(mockRemoveDocument).toHaveBeenCalledWith(DOCUMENTO.path)
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Documento eliminado.')
  })

  it('muestra el error del servidor al fallar el borrado de documento', async () => {
    mockRemoveDocument.mockResolvedValue({
      ok: false,
      error: 'No se pudo completar la operación con el archivo.',
    })
    const user = userEvent.setup()
    renderLab({ documents: [DOCUMENTO] })

    await user.click(screen.getByRole('button', { name: /eliminar doc1\.pdf/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo completar/i)
  })
})
