import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { StageColumnForm } from './StageColumnForm'
import { createEtapaSeleccion } from '@/modules/recruitment/actions/createEtapaSeleccion'
import { updateEtapaSeleccion } from '@/modules/recruitment/actions/updateEtapaSeleccion'
import { deleteEtapaSeleccion } from '@/modules/recruitment/actions/deleteEtapaSeleccion'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/recruitment/actions/createEtapaSeleccion', () => ({
  createEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/updateEtapaSeleccion', () => ({
  updateEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/deleteEtapaSeleccion', () => ({
  deleteEtapaSeleccion: vi.fn(),
}))

const STAGE = { id: 20, nombre: 'Entrevista', orden: 1, color: null }

describe('<StageColumnForm />', () => {
  const onDone = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('crear: solo pide el nombre (ni fase ni orden) y avisa al terminar', async () => {
    vi.mocked(createEtapaSeleccion).mockResolvedValue({ ok: true, id: 40 })
    const user = userEvent.setup()
    render(<StageColumnForm onDone={onDone} />)

    expect(screen.queryByLabelText(/fase/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/orden/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar columna/ })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre de la columna'), 'Prueba práctica')
    await user.click(screen.getByRole('button', { name: 'Crear columna' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createEtapaSeleccion).toHaveBeenCalledWith({ nombre: 'Prueba práctica', color: null })
    expect(toast.success).toHaveBeenCalledWith('Columna creada.')
  })

  it('crear sin nombre no llega al servidor', async () => {
    const user = userEvent.setup()
    render(<StageColumnForm onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'Crear columna' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Nombre de la columna')).toHaveAttribute('aria-invalid', 'true')
    )
    expect(createEtapaSeleccion).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('editar: renombra la columna', async () => {
    vi.mocked(updateEtapaSeleccion).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<StageColumnForm stage={STAGE} onDone={onDone} />)

    const nombre = screen.getByLabelText('Nombre de la columna')
    await user.clear(nombre)
    await user.type(nombre, 'Entrevista con RRHH')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(updateEtapaSeleccion).toHaveBeenCalledWith(20, {
      nombre: 'Entrevista con RRHH',
      color: null,
    })
    expect(toast.success).toHaveBeenCalledWith('Columna actualizada.')
  })

  it('el error del servidor se muestra y la ventana no se cierra', async () => {
    vi.mocked(updateEtapaSeleccion).mockResolvedValue({
      ok: false,
      error: 'Ya existe una columna con ese nombre.',
    })
    const user = userEvent.setup()
    render(<StageColumnForm stage={STAGE} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ya existe una columna con ese nombre.')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('con candidatos adentro no deja eliminar y dice qué hacer', () => {
    render(<StageColumnForm stage={STAGE} cardCount={2} onDone={onDone} />)

    expect(screen.getByRole('button', { name: /Eliminar columna/ })).toBeDisabled()
    expect(screen.getByText(/mové primero a los 2 candidatos que tiene/)).toBeInTheDocument()
  })

  it('vacía: eliminar pide confirmación antes de tocar nada', async () => {
    vi.mocked(deleteEtapaSeleccion).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<StageColumnForm stage={STAGE} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: /Eliminar columna/ }))
    const confirmar = screen.getByRole('alertdialog')
    expect(deleteEtapaSeleccion).not.toHaveBeenCalled()

    await user.click(within(confirmar).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(deleteEtapaSeleccion).toHaveBeenCalledWith(20)
    expect(toast.success).toHaveBeenCalledWith('Columna eliminada.')
  })

  it('cancelar la confirmación no elimina', async () => {
    const user = userEvent.setup()
    render(<StageColumnForm stage={STAGE} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: /Eliminar columna/ }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' })
    )

    expect(deleteEtapaSeleccion).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('si el servidor no deja eliminar (alguien movió un candidato ahí), muestra el motivo', async () => {
    vi.mocked(deleteEtapaSeleccion).mockResolvedValue({
      ok: false,
      error: 'Hay 1 candidato en esta columna. Muévalo a otra antes de eliminarla.',
    })
    const user = userEvent.setup()
    render(<StageColumnForm stage={STAGE} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: /Eliminar columna/ }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
    )

    expect(await screen.findByText(/Hay 1 candidato en esta columna/)).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
