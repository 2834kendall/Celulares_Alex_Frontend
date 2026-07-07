import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'
import { PERMISOS } from '@/lib/permissions/catalog'

const mockUsePathname = vi.fn<() => string>()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

const ALL_PERMISOS = Object.values(PERMISOS)

const ZONAS = [
  'Empleados',
  'Asistencia',
  'Nomina',
  'Reclutamiento',
  'Evaluaciones',
  'Configuracion',
]

describe('<Sidebar />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/dashboard')
  })

  it('con todos los permisos muestra todas las zonas', () => {
    render(<Sidebar permisos={ALL_PERMISOS} />)

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument()
    for (const zona of ZONAS) {
      expect(screen.getByRole('link', { name: new RegExp(zona, 'i') })).toBeInTheDocument()
    }
  })

  it('sin permisos solo muestra Inicio', () => {
    render(<Sidebar permisos={[]} />)

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument()
    for (const zona of ZONAS) {
      expect(screen.queryByRole('link', { name: new RegExp(zona, 'i') })).not.toBeInTheDocument()
    }
  })

  it('perfil tipo EMPLEADO: ve Asistencia y Nomina pero no Configuracion', () => {
    render(
      <Sidebar
        permisos={[PERMISOS.ASISTENCIA_WRITE, PERMISOS.AUSENCIAS_WRITE, PERMISOS.COMPROBANTES_READ]}
      />
    )

    expect(screen.getByRole('link', { name: /asistencia/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /nomina/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /empleados/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /configuracion/i })).not.toBeInTheDocument()
  })

  it('marca la zona activa por coincidencia exacta', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    render(<Sidebar permisos={[]} />)

    expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marca la zona activa en subrutas', () => {
    mockUsePathname.mockReturnValue('/employees/123')
    render(<Sidebar permisos={[PERMISOS.EMPLEADOS_READ]} />)

    expect(screen.getByRole('link', { name: /empleados/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /inicio/i })).not.toHaveAttribute('aria-current')
  })
})
