import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RubroForm } from './RubroForm'
import { createRubro } from '../actions/createRubro'
import { updateRubro } from '../actions/updateRubro'

vi.mock('../actions/createRubro', () => ({ createRubro: vi.fn() }))
vi.mock('../actions/updateRubro', () => ({ updateRubro: vi.fn() }))
const rubro = {
  areaId: 3,
  criterioId: 8,
  nombre: 'Servicio',
  descripcion: 'Atención al cliente',
  activo: true,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createRubro).mockResolvedValue({ ok: true, id: 4 })
  vi.mocked(updateRubro).mockResolvedValue({ ok: true })
})
async function fill() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nombre del rubro'), ' Servicio ')
  await user.type(screen.getByLabelText('Descripción corta'), ' Atención al cliente ')
  return user
}
describe('evaluation rubric form', () => {
  it('validates required fields without contacting the server', async () => {
    render(<RubroForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar rubro' }))
    expect(
      await screen.findByText('El nombre debe tener al menos 3 caracteres.')
    ).toBeInTheDocument()
    expect(createRubro).not.toHaveBeenCalled()
  })
  it('creates normalized data and clears fields only after confirmed success', async () => {
    const success = vi.fn()
    render(<RubroForm onSuccess={success} />)
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Guardar rubro' }))
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(createRubro).toHaveBeenCalledExactlyOnceWith({
      nombre: 'Servicio',
      descripcion: 'Atención al cliente',
    })
    expect(screen.getByLabelText('Nombre del rubro')).toHaveValue('')
    expect(updateRubro).not.toHaveBeenCalled()
  })
  it.each([8, null])(
    'updates the original area and criterion (%s) without clearing the edited fields',
    async (criterioId) => {
      const success = vi.fn()
      render(<RubroForm rubro={{ ...rubro, criterioId }} onSuccess={success} />)
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar rubro' }))
      await waitFor(() => expect(success).toHaveBeenCalledOnce())
      expect(updateRubro).toHaveBeenCalledExactlyOnceWith(3, criterioId, {
        nombre: 'Servicio',
        descripcion: 'Atención al cliente',
      })
      expect(screen.getByLabelText('Nombre del rubro')).toHaveValue('Servicio')
      expect(createRubro).not.toHaveBeenCalled()
    }
  )
  it('preserves the draft and does not close on a server rejection', async () => {
    vi.mocked(createRubro).mockResolvedValue({ ok: false, error: 'Nombre repetido.' })
    const success = vi.fn()
    render(<RubroForm onSuccess={success} />)
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Guardar rubro' }))
    expect(await screen.findByText('Nombre repetido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del rubro')).toHaveValue(' Servicio ')
    expect(success).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    'releases submitting state after a thrown request in edit mode %s',
    async (editing) => {
      const action = editing ? vi.mocked(updateRubro) : vi.mocked(createRubro)
      action.mockRejectedValueOnce(new Error('offline'))
      const success = vi.fn()
      render(<RubroForm rubro={editing ? rubro : undefined} onSuccess={success} />)
      if (!editing) await fill()
      const name = editing ? 'Actualizar rubro' : 'Guardar rubro'
      await userEvent.click(screen.getByRole('button', { name }))
      expect(
        await screen.findByText(
          'No se pudo confirmar el guardado. Revisá los rubros antes de reintentar.'
        )
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name })).toBeEnabled()
      expect(screen.getByLabelText('Nombre del rubro')).not.toHaveValue('')
      expect(success).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name }))
      await waitFor(() => expect(success).toHaveBeenCalledOnce())
    }
  )
})
