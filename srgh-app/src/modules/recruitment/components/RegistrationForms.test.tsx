import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { NuevaPostulacionForm } from './NuevaPostulacionForm'
import { NuevoCandidatoForm } from './NuevoCandidatoForm'
import { createPostulacion } from '../actions/createPostulacion'
import { createCandidateWithPostulacion } from '../actions/createCandidateWithPostulacion'
import { chooseSelectMenuOption } from '@/test/selectMenu'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('../actions/createPostulacion', () => ({ createPostulacion: vi.fn() }))
vi.mock('../actions/createCandidateWithPostulacion', () => ({
  createCandidateWithPostulacion: vi.fn(),
}))
const puestos = [{ id: 3, nombre: 'Ventas' }]
const sucursales = [{ id: 5, nombre: 'Centro' }]
beforeEach(() => vi.resetAllMocks())

describe('existing candidate application form', () => {
  it('does not send an application without a position', async () => {
    render(<NuevaPostulacionForm candidatoId={4} puestos={puestos} sucursales={sucursales} />)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar postulación' }))
    expect(await screen.findByText('El puesto es obligatorio')).toBeInTheDocument()
    expect(createPostulacion).not.toHaveBeenCalled()
  })
  it('preserves position and observations after a server rejection', async () => {
    vi.mocked(createPostulacion).mockResolvedValue({ ok: false, error: 'No se pudo registrar.' })
    const success = vi.fn()
    render(
      <NuevaPostulacionForm
        candidatoId={4}
        puestos={puestos}
        sucursales={sucursales}
        onSuccess={success}
      />
    )
    const user = userEvent.setup()
    await chooseSelectMenuOption(user, 'Puesto', 'Ventas')
    await user.type(screen.getByLabelText('Observaciones (opcional)'), 'Experiencia previa')
    await user.click(screen.getByRole('button', { name: 'Registrar postulación' }))
    expect(await screen.findByText('No se pudo registrar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Observaciones (opcional)')).toHaveValue('Experiencia previa')
    expect(success).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
  it('recovers a thrown request without losing input or claiming success', async () => {
    vi.mocked(createPostulacion)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, postulacionId: 9 })
    const success = vi.fn()
    render(
      <NuevaPostulacionForm
        candidatoId={4}
        puestos={puestos}
        sucursales={sucursales}
        onSuccess={success}
      />
    )
    const user = userEvent.setup()
    await chooseSelectMenuOption(user, 'Puesto', 'Ventas')
    await chooseSelectMenuOption(user, 'Sucursal (opcional)', 'Centro')
    await user.type(screen.getByLabelText('Observaciones (opcional)'), 'Experiencia previa')
    await user.click(screen.getByRole('button', { name: 'Registrar postulación' }))
    expect(
      await screen.findByText(
        'No se pudo confirmar el registro. Revisá las postulaciones antes de reintentar.'
      )
    ).toBeInTheDocument()
    expect(success).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Observaciones (opcional)')).toHaveValue('Experiencia previa')
    await user.click(screen.getByRole('button', { name: 'Registrar postulación' }))
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(createPostulacion).toHaveBeenLastCalledWith(4, {
      pos_puesto_id: 3,
      pos_sucursal_id: 5,
      pos_observaciones: 'Experiencia previa',
    })
  })
})

async function fillCandidate() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nombre', { exact: true }), 'Ana')
  await user.type(screen.getByLabelText('Primer apellido'), 'Perez')
  await chooseSelectMenuOption(user, 'Tipo de identificación', 'Cédula')
  await user.type(screen.getByLabelText('Número de identificación'), '123456789')
  await user.type(screen.getByLabelText('Correo', { exact: true }), 'ana@example.test')
  await chooseSelectMenuOption(user, /Puesto/, 'Ventas')
  return user
}

describe('new candidate registration form', () => {
  const props = { tiposIdentificacion: [{ id: 1, nombre: 'Cédula' }], puestos, sucursales }
  it('validates identity and email before sending data', async () => {
    render(<NuevoCandidatoForm {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar candidato' }))
    expect(await screen.findByText('Correo electrónico inválido')).toBeInTheDocument()
    expect(createCandidateWithPostulacion).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
  it('keeps the entered identity on server rejection and never navigates to a nonexistent record', async () => {
    vi.mocked(createCandidateWithPostulacion).mockResolvedValue({
      ok: false,
      error: 'La identificación ya existe.',
    })
    render(<NuevoCandidatoForm {...props} />)
    const user = await fillCandidate()
    await user.click(screen.getByRole('button', { name: 'Registrar candidato' }))
    expect(await screen.findByText('La identificación ya existe.')).toBeInTheDocument()
    expect(screen.getByLabelText('Número de identificación')).toHaveValue('123456789')
    expect(push).not.toHaveBeenCalled()
  })
  it('preserves candidate data after a thrown request and navigates only after confirmed retry', async () => {
    vi.mocked(createCandidateWithPostulacion)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, candidatoId: 8, postulacionId: 9 })
    const success = vi.fn()
    render(<NuevoCandidatoForm {...props} onSuccess={success} />)
    const user = await fillCandidate()
    await user.click(screen.getByRole('button', { name: 'Registrar candidato' }))
    expect(
      await screen.findByText(
        'No se pudo confirmar el registro. Revisá el tablero antes de reintentar.'
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Correo', { exact: true })).toHaveValue('ana@example.test')
    expect(push).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Registrar candidato' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/recruitment/candidates/8'))
    expect(createCandidateWithPostulacion).toHaveBeenLastCalledWith({
      candidato: expect.objectContaining({
        cdt_nombre: 'Ana',
        cdt_apellido_1: 'Perez',
        cdt_tipo_identificacion_id: 1,
        cdt_numero_identificacion: '123456789',
        cdt_email: 'ana@example.test',
        cdt_apellido_2: null,
        cdt_telefono: null,
        cdt_fuente_reclutamiento: null,
      }),
      postulacion: expect.objectContaining({ pos_puesto_id: 3, pos_observaciones: null }),
    })
    expect(success).toHaveBeenCalledOnce()
    expect(toast.success).toHaveBeenCalledOnce()
  })
})
