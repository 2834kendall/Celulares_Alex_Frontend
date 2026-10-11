import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompanyProfileForm } from './CompanyProfileForm'
import { updateCompanyProfile } from '@/modules/settings/actions/updateCompanyProfile'
import { TERRITORIO } from '@/modules/employees/components/testFixtures'
import type { CompanyProfile } from '@/modules/settings/types'

vi.mock('@/modules/settings/actions/updateCompanyProfile', () => ({
  updateCompanyProfile: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const mockUpdate = vi.mocked(updateCompanyProfile)
const onSuccess = vi.fn()
const onCancel = vi.fn()

const PROFILE: CompanyProfile = {
  org_cedula_juridica: '3-101-123456',
  org_nombre_social: 'Celulares Alex S.A.',
  org_nombre_fantasia: 'Celulares Alex',
  org_email_corporativo: null,
  org_telefono: null,
  org_representante_legal: null,
  org_actividad_economica_ciiu: null,
  direccion: { dir_distrito_id: 101, dir_senas_exactas: '200 m norte del parque central' },
  logoUrl: null,
}

describe('<CompanyProfileForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra la cédula jurídica sin dejar editarla', () => {
    render(
      <CompanyProfileForm
        profile={PROFILE}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    )

    const cedula = screen.getByDisplayValue('3-101-123456')
    expect(cedula).toBeDisabled()
  })

  it('"Guardar cambios" arranca deshabilitado hasta que se cambia algo', async () => {
    render(
      <CompanyProfileForm
        profile={PROFILE}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    )
    const guardar = screen.getByRole('button', { name: /guardar cambios/i })
    expect(guardar).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/teléfono/i), '2222-3333')

    expect(guardar).toBeEnabled()
  })

  it('guarda con los datos del formulario', async () => {
    mockUpdate.mockResolvedValue({ ok: true })
    render(
      <CompanyProfileForm
        profile={PROFILE}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    )

    await userEvent.type(screen.getByLabelText(/correo corporativo/i), 'info@celularesalex.cr')
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      org_nombre_social: 'Celulares Alex S.A.',
      org_email_corporativo: 'info@celularesalex.cr',
      direccion: { dir_distrito_id: 101 },
    })
  })

  it('un correo mal escrito no llega al servidor', async () => {
    render(
      <CompanyProfileForm
        profile={PROFILE}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    )

    await userEvent.type(screen.getByLabelText(/correo corporativo/i), 'no-es-correo')
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText('Correo electrónico inválido.')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('Cancelar vuelve a modo lectura sin guardar', async () => {
    render(
      <CompanyProfileForm
        profile={PROFILE}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('muestra el error que devuelve el servidor', async () => {
    mockUpdate.mockResolvedValue({ ok: false, error: 'No tenés permiso.' })
    render(
      <CompanyProfileForm
        profile={PROFILE}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    )

    await userEvent.type(screen.getByLabelText(/teléfono/i), '2222-3333')
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText('No tenés permiso.')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
