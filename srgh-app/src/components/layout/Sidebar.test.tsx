import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from './Sidebar'
import { PERMISOS } from '@/lib/permissions/catalog'

const mockUsePathname = vi.fn<() => string>()
const openSearch = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

const ALL_PERMISOS = Object.values(PERMISOS)
const EMPRESA = 'TecnoCel'
const SUCURSAL = 'PZ2'

const ZONAS = [
  'Empleados',
  'Asistencia',
  'Horarios',
  'Nomina',
  'Reclutamiento',
  'Evaluaciones',
  'Configuracion',
]

describe('<Sidebar onOpenSettingsSearch={openSearch} />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/dashboard')
  })

  it('con todos los permisos muestra todas las zonas', () => {
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={ALL_PERMISOS}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument()
    for (const zona of ZONAS) {
      expect(screen.getByRole('link', { name: new RegExp(zona, 'i') })).toBeInTheDocument()
    }
  })

  it('sin permisos solo muestra Inicio', () => {
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument()
    for (const zona of ZONAS) {
      expect(screen.queryByRole('link', { name: new RegExp(zona, 'i') })).not.toBeInTheDocument()
    }
  })

  it('perfil tipo EMPLEADO: ve Asistencia y Nomina pero no Configuracion', () => {
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[PERMISOS.ASISTENCIA_WRITE, PERMISOS.AUSENCIAS_WRITE, PERMISOS.COMPROBANTES_READ]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByRole('link', { name: /asistencia/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /nomina/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /empleados/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /configuracion/i })).not.toBeInTheDocument()
  })

  it('muestra el nombre de la empresa recibido por props', () => {
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByText(EMPRESA)).toBeInTheDocument()
    expect(screen.getByText(EMPRESA.charAt(0))).toBeInTheDocument()
  })

  it('con sucursal asignada la muestra debajo del nombre de la empresa', () => {
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={SUCURSAL}
      />
    )

    expect(screen.getByText(SUCURSAL)).toBeInTheDocument()
  })

  it('sin sucursal asignada (p. ej. ADMIN) cae al nombre del sistema', () => {
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByText('SGRH')).toBeInTheDocument()
  })

  it('marca la zona activa por coincidencia exacta', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marca la zona activa en subrutas', () => {
    mockUsePathname.mockReturnValue('/employees/123')
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[PERMISOS.EMPLEADOS_READ]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByRole('link', { name: /empleados/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /inicio/i })).not.toHaveAttribute('aria-current')
  })

  it('colapsado se anima a ancho cero y queda inerte (open=false)', () => {
    const { container } = render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
        open={false}
      />
    )
    const aside = container.querySelector('aside')

    expect(aside?.className).toContain('w-0')
    expect(aside?.className).not.toContain('w-64')
    // Accesibilidad: sin foco por teclado ni lectores de pantalla al estar oculto
    expect(aside?.hasAttribute('inert')).toBe(true)
  })

  it('abierto no esta inerte', () => {
    const { container } = render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={[]}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )
    expect(container.querySelector('aside')?.hasAttribute('inert')).toBe(false)
  })

  it('en /settings entra en modo configuración: menú de Configuración en lugar del principal', () => {
    mockUsePathname.mockReturnValue('/settings/employees/positions')
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={ALL_PERMISOS}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByRole('link', { name: /volver/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /puestos/i })).toHaveAttribute('aria-current', 'page')
    // La cabecera cambia: deja de mostrar la empresa como en el menú principal.
    expect(screen.getByText('Configuración')).toBeInTheDocument()
    expect(screen.queryByText('SGRH')).not.toBeInTheDocument()
    // El menú principal no se muestra.
    expect(screen.queryByRole('link', { name: /inicio/i })).not.toBeInTheDocument()
  })

  it('en modo configuración el botón de búsqueda abre el buscador', async () => {
    mockUsePathname.mockReturnValue('/settings/general')
    render(
      <Sidebar
        onOpenSettingsSearch={openSearch}
        permisos={ALL_PERMISOS}
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /buscar ajuste/i }))
    expect(openSearch).toHaveBeenCalledTimes(1)
  })
})
