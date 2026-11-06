import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditNotesModal } from './EditNotesModal'
import { updateEvaluationNotes } from '../actions/updateEvaluationNotes'

vi.mock('../actions/updateEvaluationNotes', () => ({ updateEvaluationNotes: vi.fn() }))
const notes = { fortalezas: ['Servicio'], mejoras: ['Orden'], comentarios: 'Original' }
beforeEach(() => vi.resetAllMocks())
describe('evaluation note editor recovery', () => {
  it('preserves comments after a network failure and closes only after confirmed retry', async () => {
    const close = vi.fn()
    vi.mocked(updateEvaluationNotes)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true })
    render(<EditNotesModal evaluationId={8} field="comentarios" notes={notes} onClose={close} />)
    const user = userEvent.setup()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'Actualizado')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(
      await screen.findByText('No se pudieron guardar las notas. Reintentá.')
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Actualizado')
    expect(close).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(updateEvaluationNotes).toHaveBeenLastCalledWith(8, {
      ...notes,
      comentarios: 'Actualizado',
    })
  })
  it('keeps the editor open when the server reports that no evaluation was updated', async () => {
    const close = vi.fn()
    vi.mocked(updateEvaluationNotes).mockResolvedValue({
      ok: false,
      error: 'La evaluación no está disponible.',
    })
    render(<EditNotesModal evaluationId={8} field="comentarios" notes={notes} onClose={close} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('La evaluación no está disponible.')).toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })
  it('saving one notes field preserves the other two fields', async () => {
    vi.mocked(updateEvaluationNotes).mockResolvedValue({ ok: true })
    render(<EditNotesModal evaluationId={8} field="fortalezas" notes={notes} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Servicio' }))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), 'Puntualidad{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(updateEvaluationNotes).toHaveBeenCalledWith(8, {
        ...notes,
        fortalezas: ['Puntualidad'],
      })
    )
  })
})
