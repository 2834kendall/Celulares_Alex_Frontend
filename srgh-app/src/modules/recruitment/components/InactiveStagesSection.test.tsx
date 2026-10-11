import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { InactiveStagesSection } from './InactiveStagesSection'
import { purgeSelectionStage } from '@/modules/recruitment/actions/purgeSelectionStage'
import { restoreSelectionStage } from '@/modules/recruitment/actions/restoreSelectionStage'
import type { InactiveStageItem } from '@/modules/recruitment/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/recruitment/actions/restoreSelectionStage', () => ({
  restoreSelectionStage: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/purgeSelectionStage', () => ({
  purgeSelectionStage: vi.fn(),
}))

const INACTIVE: InactiveStageItem[] = [
  { id: 14, nombre: 'Inducción General', color: null, cardCount: 0 },
  { id: 9, nombre: 'Prueba Técnica', color: '#1e3a8a', cardCount: 2 },
]

describe('<InactiveStagesSection />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sin etapas desactivadas no dibuja nada', () => {
    const { container } = render(<InactiveStagesSection stages={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('arranca cerrada, con la cantidad a la vista', () => {
    render(<InactiveStagesSection stages={INACTIVE} />)

    const titulo = screen.getByRole('button', { name: /Etapas desactivadas/ })
    expect(titulo).toHaveAttribute('aria-expanded', 'false')
    expect(titulo).toHaveTextContent('2')
  })

  it('lista cada etapa y avisa si todavía tiene candidatos parados en ella', async () => {
    const user = userEvent.setup()
    render(<InactiveStagesSection stages={INACTIVE} />)

    await user.click(screen.getByRole('button', { name: /Etapas desactivadas/ }))

    expect(screen.getByText('Inducción General')).toBeInTheDocument()
    expect(screen.getByText('Sin candidatos en proceso')).toBeInTheDocument()
    expect(
      screen.getByText('2 candidatos siguen acá: en el tablero aparecen en "Sin etapa"')
    ).toBeInTheDocument()
  })

  it('restaurar la devuelve al tablero y avisa a quien lista las columnas', async () => {
    vi.mocked(restoreSelectionStage).mockResolvedValue({ ok: true })
    const onRestored = vi.fn()
    const user = userEvent.setup()
    render(<InactiveStagesSection stages={INACTIVE} onRestored={onRestored} />)

    await user.click(screen.getByRole('button', { name: /Etapas desactivadas/ }))
    await user.click(screen.getByRole('button', { name: 'Restaurar Prueba Técnica' }))

    expect(restoreSelectionStage).toHaveBeenCalledWith(9)
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        '"Prueba Técnica" volvió al tablero, como última columna.'
      )
    )
    expect(onRestored).toHaveBeenCalledWith(9)
  })

  it('si restaurar falla muestra el motivo', async () => {
    vi.mocked(restoreSelectionStage).mockResolvedValue({
      ok: false,
      error: 'Esa etapa ya no está desactivada. Recargue la página.',
    })
    const onRestored = vi.fn()
    const user = userEvent.setup()
    render(<InactiveStagesSection stages={INACTIVE} onRestored={onRestored} />)

    await user.click(screen.getByRole('button', { name: /Etapas desactivadas/ }))
    await user.click(screen.getByRole('button', { name: 'Restaurar Prueba Técnica' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Esa etapa ya no está desactivada. Recargue la página.'
      )
    )
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('eliminar del todo pide confirmación antes de borrar', async () => {
    vi.mocked(purgeSelectionStage).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<InactiveStagesSection stages={INACTIVE} />)

    await user.click(screen.getByRole('button', { name: /Etapas desactivadas/ }))
    await user.click(screen.getByRole('button', { name: 'Eliminar del todo Inducción General' }))

    const confirmar = screen.getByRole('alertdialog')
    expect(purgeSelectionStage).not.toHaveBeenCalled()
    await user.click(within(confirmar).getByRole('button', { name: 'Eliminar' }))

    expect(purgeSelectionStage).toHaveBeenCalledWith(14)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Etapa eliminada.'))
  })

  it('si la base no deja borrarla (tiene historial) muestra el motivo', async () => {
    vi.mocked(purgeSelectionStage).mockResolvedValue({
      ok: false,
      error:
        'No se puede eliminar del todo: hay candidatos que pasaron por esta etapa. Queda desactivada para conservar su historial.',
    })
    const user = userEvent.setup()
    render(<InactiveStagesSection stages={INACTIVE} />)

    await user.click(screen.getByRole('button', { name: /Etapas desactivadas/ }))
    await user.click(screen.getByRole('button', { name: 'Eliminar del todo Prueba Técnica' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No se puede eliminar'))
    )
  })
})
