import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { DiscardApplicationDialog } from './DiscardApplicationDialog'
import { rejectPostulacion } from '../actions/rejectPostulacion'

vi.mock('../actions/rejectPostulacion', () => ({ rejectPostulacion: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rejectPostulacion).mockResolvedValue({ ok: true })
})
const submit = () => screen.getByRole('button', { name: 'Descartar postulación' })
describe('application discard confirmation', () => {
  it('names the affected candidate and explains irreversibility', () => {
    render(
      <DiscardApplicationDialog applicationId={7} candidateName="Ana Prueba" onClose={vi.fn()} />
    )
    expect(screen.getByRole('dialog', { name: 'Descartar a Ana Prueba' })).toBeInTheDocument()
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo del descarte')).toHaveFocus()
  })
  it.each(['', '  ', 'ab'])(
    'requires a meaningful reason (%s) before requesting a discard',
    async (reason) => {
      render(<DiscardApplicationDialog applicationId={7} onClose={vi.fn()} />)
      if (reason) await userEvent.type(screen.getByLabelText('Motivo del descarte'), reason)
      await userEvent.click(submit())
      expect(await screen.findByText('Describe brevemente el motivo.')).toBeInTheDocument()
      expect(rejectPostulacion).not.toHaveBeenCalled()
    }
  )
  it('sends the exact application and trimmed reason, then closes before refreshing', async () => {
    const calls: string[] = []
    render(
      <DiscardApplicationDialog
        applicationId={7}
        onClose={() => calls.push('close')}
        onDone={() => calls.push('done')}
      />
    )
    await userEvent.type(screen.getByLabelText('Motivo del descarte'), ' Sin disponibilidad ')
    await userEvent.click(submit())
    await waitFor(() => expect(calls).toEqual(['close', 'done']))
    expect(rejectPostulacion).toHaveBeenCalledExactlyOnceWith({
      postulacionId: 7,
      motivo: 'Sin disponibilidad',
    })
    expect(toast.success).toHaveBeenCalledWith('Postulación descartada.')
  })
  it('preserves the reason and keeps the dialog open after a server rejection', async () => {
    vi.mocked(rejectPostulacion).mockResolvedValue({
      ok: false,
      error: 'La postulación ya cambió.',
    })
    const close = vi.fn()
    render(<DiscardApplicationDialog applicationId={7} onClose={close} />)
    await userEvent.type(screen.getByLabelText('Motivo del descarte'), 'Sin disponibilidad')
    await userEvent.click(submit())
    expect(await screen.findByText('La postulación ya cambió.')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo del descarte')).toHaveValue('Sin disponibilidad')
    expect(close).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(submit()).toBeEnabled()
  })
  it('blocks duplicate submissions and cancellation while saving', async () => {
    let finish!: (value: { ok: true }) => void
    vi.mocked(rejectPostulacion).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<DiscardApplicationDialog applicationId={7} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Motivo del descarte'), 'Sin disponibilidad')
    await userEvent.dblClick(submit())
    expect(rejectPostulacion).toHaveBeenCalledOnce()
    expect(submit()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.getByLabelText('Motivo del descarte')).toBeDisabled()
    await act(async () => finish({ ok: true }))
  })
  it('can cancel an unchanged dialog without discarding anything', async () => {
    const close = vi.fn()
    render(<DiscardApplicationDialog applicationId={7} onClose={close} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(close).toHaveBeenCalledOnce()
    expect(rejectPostulacion).not.toHaveBeenCalled()
  })
  it('recovers a thrown request without losing the reason or claiming success', async () => {
    vi.mocked(rejectPostulacion).mockRejectedValueOnce(new Error('offline'))
    const close = vi.fn()
    render(<DiscardApplicationDialog applicationId={7} onClose={close} />)
    await userEvent.type(screen.getByLabelText('Motivo del descarte'), 'Sin disponibilidad')
    await userEvent.click(submit())
    expect(
      await screen.findByText(
        'No se pudo confirmar el descarte. Revisá la postulación antes de reintentar.'
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo del descarte')).toHaveValue('Sin disponibilidad')
    expect(submit()).toBeEnabled()
    expect(close).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    await userEvent.click(submit())
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
  })
})
