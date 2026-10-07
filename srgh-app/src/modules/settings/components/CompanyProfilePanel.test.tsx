import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompanyProfilePanel } from './CompanyProfilePanel'
import { TERRITORIO } from '@/modules/employees/components/testFixtures'
import type { CompanyProfile } from '@/modules/settings/types'

vi.mock('@/modules/settings/actions/updateCompanyProfile', () => ({
  updateCompanyProfile: vi.fn(),
}))
vi.mock('@/modules/settings/actions/setCompanyLogo', () => ({ setCompanyLogo: vi.fn() }))
vi.mock('@/modules/settings/actions/removeCompanyLogo', () => ({ removeCompanyLogo: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const PROFILE: CompanyProfile = {
  org_cedula_juridica: '3-101-123456',
  org_nombre_social: 'Celulares Alex S.A.',
  org_nombre_fantasia: 'Celulares Alex',
  org_email_corporativo: 'info@celularesalex.cr',
  org_telefono: null,
  org_representante_legal: null,
  org_actividad_economica_ciiu: null,
  direccion: { dir_distrito_id: 101, dir_senas_exactas: '200 m norte del parque central' },
  logoUrl: null,
}

describe('<CompanyProfilePanel />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('arranca en modo lectura: datos visibles, sin campos editables', () => {
    render(<CompanyProfilePanel profile={PROFILE} territorio={TERRITORIO} />)

    expect(screen.getByText('info@celularesalex.cr')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument()
  })

  it('muestra la ubicación derivada del distrito y "—" en lo vacío', () => {
    render(<CompanyProfilePanel profile={PROFILE} territorio={TERRITORIO} />)

    expect(screen.getByText('Carmen')).toBeInTheDocument()
    // Provincia y cantón se llaman igual en el fixture: San José / San José.
    expect(screen.getAllByText('San José')).toHaveLength(2)
    expect(screen.getByText('10101')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('sin dirección cargada muestra todo en "—"', () => {
    render(
      <CompanyProfilePanel profile={{ ...PROFILE, direccion: null }} territorio={TERRITORIO} />
    )

    expect(screen.queryByText('Carmen')).not.toBeInTheDocument()
  })

  it('el logo solo se cambia en modo edición', async () => {
    render(<CompanyProfilePanel profile={PROFILE} territorio={TERRITORIO} />)
    expect(screen.queryByRole('button', { name: 'Cambiar logo' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar logo' }))

    expect(screen.getByRole('dialog', { name: 'Logo de la empresa' })).toBeInTheDocument()
  })

  it('Editar abre el formulario y Cancelar vuelve a lectura', async () => {
    render(<CompanyProfilePanel profile={PROFILE} territorio={TERRITORIO} />)

    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(screen.getByDisplayValue('Celulares Alex S.A.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByDisplayValue('Celulares Alex S.A.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument()
  })
})
