import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RubroSeleccionForm } from './RubroSeleccionForm'
import { createCriterioSeleccion } from '../actions/createCriterioSeleccion'
import { updateCriterioSeleccion } from '../actions/updateCriterioSeleccion'

vi.mock('../actions/createCriterioSeleccion', () => ({ createCriterioSeleccion: vi.fn() }))
vi.mock('../actions/updateCriterioSeleccion', () => ({ updateCriterioSeleccion: vi.fn() }))
const rubro = {
  areaId: 4,
  criterioId: 8,
  nombre: 'Servicio',
  descripcion: 'Atención al cliente',
  color: '#123abc',
  peso: 2,
  activo: true,
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createCriterioSeleccion).mockResolvedValue({ ok: true, id: 4 })
  vi.mocked(updateCriterioSeleccion).mockResolvedValue({ ok: true })
})
async function fill() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nombre del criterio'), ' Servicio ')
  await user.type(screen.getByLabelText('Descripción corta'), ' Atención al cliente ')
  return user
}
describe('selection criterion form', () => {
  it('validates required text without sending a mutation', async () => {
    render(<RubroSeleccionForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar criterio' }))
    expect(
      await screen.findByText('El nombre debe tener al menos 3 caracteres.')
    ).toBeInTheDocument()
    expect(createCriterioSeleccion).not.toHaveBeenCalled()
  })
  it.each([0, 11])('rejects an out-of-range weight %s', async (peso) => {
    render(<RubroSeleccionForm rubro={rubro} />)
    fireEvent.change(screen.getByLabelText('Peso'), { target: { value: peso } })
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar criterio' }))
    expect(updateCriterioSeleccion).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Peso')).toHaveAttribute('aria-invalid', 'true')
  })
  it('creates normalized text with the default weight and resets after confirmed success', async () => {
    const success = vi.fn()
    render(<RubroSeleccionForm onSuccess={success} />)
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Guardar criterio' }))
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(createCriterioSeleccion).toHaveBeenCalledExactlyOnceWith({
      nombre: 'Servicio',
      descripcion: 'Atención al cliente',
      color: null,
      peso: 1,
    })
    expect(screen.getByLabelText('Nombre del criterio')).toHaveValue('')
    expect(screen.getByLabelText('Peso')).toHaveValue(1)
    expect(updateCriterioSeleccion).not.toHaveBeenCalled()
  })
  it.each([8, null])(
    'updates the selected area/criterion, preserving configured weight/color (%s)',
    async (criterioId) => {
      const success = vi.fn()
      render(<RubroSeleccionForm rubro={{ ...rubro, criterioId }} onSuccess={success} />)
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar criterio' }))
      await waitFor(() => expect(success).toHaveBeenCalledOnce())
      expect(updateCriterioSeleccion).toHaveBeenCalledExactlyOnceWith(4, criterioId, {
        nombre: 'Servicio',
        descripcion: 'Atención al cliente',
        color: '#123abc',
        peso: 2,
      })
      expect(screen.getByLabelText('Nombre del criterio')).toHaveValue('Servicio')
      expect(createCriterioSeleccion).not.toHaveBeenCalled()
    }
  )
  it('keeps edited fields and shows a server rejection without closing', async () => {
    vi.mocked(updateCriterioSeleccion).mockResolvedValue({ ok: false, error: 'Criterio repetido.' })
    const success = vi.fn()
    render(<RubroSeleccionForm rubro={rubro} onSuccess={success} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar criterio' }))
    expect(await screen.findByText('Criterio repetido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Peso')).toHaveValue(2)
    expect(success).not.toHaveBeenCalled()
  })
  it('disables controls and duplicate submission while saving', async () => {
    let finish!: (result: { ok: true }) => void
    vi.mocked(updateCriterioSeleccion).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<RubroSeleccionForm rubro={rubro} />)
    await userEvent.dblClick(screen.getByRole('button', { name: 'Actualizar criterio' }))
    expect(updateCriterioSeleccion).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Peso')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardando' })).toBeDisabled()
    await act(async () => finish({ ok: true }))
  })
  it.each([false, true])(
    'recovers a thrown request in editing mode %s and preserves the draft',
    async (editing) => {
      const action = editing
        ? vi.mocked(updateCriterioSeleccion)
        : vi.mocked(createCriterioSeleccion)
      action.mockRejectedValueOnce(new Error('offline'))
      const success = vi.fn()
      render(<RubroSeleccionForm rubro={editing ? rubro : undefined} onSuccess={success} />)
      if (!editing) await fill()
      const name = editing ? 'Actualizar criterio' : 'Guardar criterio'
      await userEvent.click(screen.getByRole('button', { name }))
      expect(
        await screen.findByText(
          'No se pudo confirmar el guardado. Revisá los criterios antes de reintentar.'
        )
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name })).toBeEnabled()
      expect(screen.getByLabelText('Nombre del criterio')).not.toHaveValue('')
      expect(success).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name }))
      await waitFor(() => expect(success).toHaveBeenCalledOnce())
    }
  )
})
