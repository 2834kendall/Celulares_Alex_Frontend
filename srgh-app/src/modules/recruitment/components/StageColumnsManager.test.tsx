import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { StageColumnsManager } from './StageColumnsManager'
import { reorderSelectionStages } from '@/modules/recruitment/actions/reorderSelectionStages'
import type { StageColumnAdminItem } from '@/modules/recruitment/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/recruitment/actions/reorderSelectionStages', () => ({
  reorderSelectionStages: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/createEtapaSeleccion', () => ({
  createEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/updateEtapaSeleccion', () => ({
  updateEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/deleteEtapaSeleccion', () => ({
  deleteEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/restoreSelectionStage', () => ({
  restoreSelectionStage: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/purgeSelectionStage', () => ({
  purgeSelectionStage: vi.fn(),
}))

const STAGES: StageColumnAdminItem[] = [
  { id: 10, nombre: 'Recibido', orden: 0, color: '#1e3a8a', cardCount: 2 },
  { id: 20, nombre: 'Entrevista', orden: 1, color: null, cardCount: 1 },
  { id: 30, nombre: 'Prueba práctica', orden: 2, color: null, cardCount: 0 },
]

function rowNames() {
  return within(screen.getByRole('list', { name: 'Columnas del tablero, en orden' }))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent)
}

describe('<StageColumnsManager />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista las columnas en el orden del tablero, con los candidatos que tiene cada una', () => {
    render(<StageColumnsManager stages={STAGES} />)

    expect(rowNames()).toEqual(['Recibido', 'Entrevista', 'Prueba práctica'])
    expect(screen.getByText('2 candidatos en proceso')).toBeInTheDocument()
    expect(screen.getByText('1 candidato en proceso')).toBeInTheDocument()
    expect(screen.getByText('Sin candidatos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver tablero/ })).toHaveAttribute(
      'href',
      '/recruitment'
    )
  })

  it('las flechas reordenan y mandan el orden completo al servidor', async () => {
    vi.mocked(reorderSelectionStages).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<StageColumnsManager stages={STAGES} />)

    await user.click(screen.getByRole('button', { name: 'Bajar Recibido' }))

    expect(reorderSelectionStages).toHaveBeenCalledWith([20, 10, 30])
  })

  it('subir una columna la cambia de lugar con la de arriba', async () => {
    vi.mocked(reorderSelectionStages).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<StageColumnsManager stages={STAGES} />)

    await user.click(screen.getByRole('button', { name: 'Subir Prueba práctica' }))

    expect(reorderSelectionStages).toHaveBeenCalledWith([10, 30, 20])
  })

  it('la primera no sube y la última no baja', () => {
    render(<StageColumnsManager stages={STAGES} />)

    expect(screen.getByRole('button', { name: 'Subir Recibido' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bajar Recibido' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Bajar Prueba práctica' })).toBeDisabled()
  })

  it('si el servidor rechaza el orden, avisa y la lista vuelve a como estaba', async () => {
    vi.mocked(reorderSelectionStages).mockResolvedValue({
      ok: false,
      error: 'Las columnas cambiaron mientras tanto. Recargue el tablero.',
    })
    const user = userEvent.setup()
    render(<StageColumnsManager stages={STAGES} />)

    await user.click(screen.getByRole('button', { name: 'Bajar Recibido' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Las columnas cambiaron mientras tanto. Recargue el tablero.'
      )
    )
    await waitFor(() => expect(rowNames()).toEqual(['Recibido', 'Entrevista', 'Prueba práctica']))
  })

  it('editar abre la columna con su nombre; con candidatos adentro no se puede eliminar', async () => {
    const user = userEvent.setup()
    render(<StageColumnsManager stages={STAGES} />)

    await user.click(screen.getByRole('button', { name: 'Editar Recibido' }))

    const editar = screen.getByRole('dialog', { name: 'Editar columna: Recibido' })
    expect(within(editar).getByLabelText('Nombre de la columna')).toHaveValue('Recibido')
    expect(within(editar).getByRole('button', { name: /Eliminar columna/ })).toBeDisabled()
  })

  it('una columna vacía sí ofrece eliminar', async () => {
    const user = userEvent.setup()
    render(<StageColumnsManager stages={STAGES} />)

    await user.click(screen.getByRole('button', { name: 'Editar Prueba práctica' }))

    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Eliminar columna/ })
    ).toBeEnabled()
  })

  it('"Nueva columna" abre el alta', async () => {
    const user = userEvent.setup()
    render(<StageColumnsManager stages={STAGES} />)

    await user.click(screen.getByRole('button', { name: /Nueva columna/ }))

    expect(screen.getByRole('dialog', { name: 'Nueva columna' })).toBeInTheDocument()
  })

  it('las etapas desactivadas se ven aparte, plegadas, y no cuentan como columnas', async () => {
    const user = userEvent.setup()
    render(
      <StageColumnsManager
        stages={STAGES}
        inactive={[{ id: 99, nombre: 'Assessment Center', color: null, cardCount: 0 }]}
      />
    )

    expect(rowNames()).toEqual(['Recibido', 'Entrevista', 'Prueba práctica'])
    const desactivadas = screen.getByRole('button', { name: /Etapas desactivadas/ })
    expect(desactivadas).toHaveAttribute('aria-expanded', 'false')

    await user.click(desactivadas)
    expect(screen.getByRole('button', { name: 'Restaurar Assessment Center' })).toBeInTheDocument()
  })

  it('sin etapas desactivadas la sección no aparece', () => {
    render(<StageColumnsManager stages={STAGES} />)

    expect(screen.queryByRole('button', { name: /Etapas desactivadas/ })).not.toBeInTheDocument()
  })

  it('sin columnas explica para qué sirven e invita a crear la primera', async () => {
    const user = userEvent.setup()
    render(<StageColumnsManager stages={[]} />)

    expect(screen.getByText('Todavía no hay columnas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Crear la primera columna/ }))
    expect(screen.getByRole('dialog', { name: 'Nueva columna' })).toBeInTheDocument()
  })
})
