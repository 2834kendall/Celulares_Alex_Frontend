import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { CandidateDocumentsSection } from './CandidateDocumentsSection'
import { addCandidateDocument } from '../actions/addCandidateDocument'
import { getCandidateDocumentDownloadUrl } from '../actions/getCandidateDocumentDownloadUrl'
import type { CandidatoDocumento } from '../types'

vi.mock('../actions/addCandidateDocument', () => ({ addCandidateDocument: vi.fn() }))
vi.mock('../actions/deleteCandidateDocument', () => ({ deleteCandidateDocument: vi.fn() }))
vi.mock('../actions/getCandidateDocumentDownloadUrl', () => ({
  getCandidateDocumentDownloadUrl: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const doc: CandidatoDocumento = {
  cdo_id: 8,
  cdo_candidato_id: 4,
  cdo_tipo: 'CV',
  cdo_nombre: 'CV Ana',
  cdo_mime: 'application/pdf',
  cdo_created_at: '2026-11-06T08:00:00',
}
beforeEach(() => vi.resetAllMocks())

describe('candidate document recovery', () => {
  it('preserves file and metadata after a thrown upload failure and allows retry', async () => {
    vi.mocked(addCandidateDocument)
      .mockRejectedValueOnce(new Error('network detail'))
      .mockResolvedValueOnce({ ok: true, docId: 9 })
    const user = userEvent.setup()
    render(<CandidateDocumentsSection candidatoId={4} documentos={[]} canWrite />)
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0])], 'ana.pdf', {
      type: 'application/pdf',
    })
    await user.upload(screen.getByTestId('document-dropzone-input'), file)
    const dialog = await screen.findByRole('dialog', { name: 'Guardar documento' })
    await user.clear(within(dialog).getByLabelText('Nombre'))
    await user.type(within(dialog).getByLabelText('Nombre'), 'Curriculum Ana')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar documento' }))
    expect(
      await within(dialog).findByText('No se pudo subir el documento. Reintentá.')
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Curriculum Ana')
    expect(within(dialog).getByText('Archivo: ana.pdf')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Guardar documento' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(addCandidateDocument).toHaveBeenCalledTimes(2)
    const retry = vi.mocked(addCandidateDocument).mock.calls[1][1]
    expect(retry.get('cdo_nombre')).toBe('Curriculum Ana')
    expect((retry.get('file') as File).name).toBe('ana.pdf')
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it('releases the download button after a network failure and permits retry', async () => {
    vi.mocked(getCandidateDocumentDownloadUrl)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false, error: 'Archivo no disponible.' })
    render(<CandidateDocumentsSection candidatoId={4} documentos={[doc]} canWrite={false} />)
    const button = screen.getByRole('button', { name: 'Abrir CV Ana' })
    await userEvent.click(button)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se pudo descargar el documento. Reintentá.')
    )
    expect(button).toBeEnabled()
    await userEvent.click(button)
    await waitFor(() => expect(getCandidateDocumentDownloadUrl).toHaveBeenCalledTimes(2))
    expect(toast.error).toHaveBeenLastCalledWith('Archivo no disponible.')
    expect(button).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Eliminar CV Ana' })).not.toBeInTheDocument()
    expect(screen.getByTestId('document-dropzone-input')).toBeDisabled()
  })
})
