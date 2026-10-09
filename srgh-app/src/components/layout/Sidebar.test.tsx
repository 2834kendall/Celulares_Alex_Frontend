import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

const ZONAS = [
  'Empleados',
  'Asistencia',
  'Horarios',
  'Nómina',
  'Reclutamiento',
  'Evaluaciones',
  'Configuración',
]

const EMPLEADO_LIKE = [
  PERMISOS.ASISTENCIA_WRITE,
  PERMISOS.AUSENCIAS_WRITE,
  PERMISOS.COMPROBANTES_READ,
]

function renderSidebar(props: { permisos?: string[]; collapsed?: boolean } = {}) {
  return render(
    <Sidebar
      onOpenSettingsSearch={openSearch}
      permisos={props.permisos ?? ALL_PERMISOS}
      empresaNombre={EMPRESA}
      collapsed={props.collapsed}
    />
  )
}

describe('<Sidebar />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/dashboard')
  })

  it('con todos los permisos muestra todas las zonas', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument()
    for (const zona of ZONAS) {
      expect(screen.getByRole('link', { name: new RegExp(zona, 'i') })).toBeInTheDocument()
    }
  })

  it('sin permisos solo muestra Inicio', () => {
    renderSidebar({ permisos: [] })

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument()
    for (const zona of ZONAS) {
      expect(screen.queryByRole('link', { name: new RegExp(zona, 'i') })).not.toBeInTheDocument()
    }
  })

  it('perfil tipo EMPLEADO: ve Asistencia y Nómina pero no Configuración', () => {
    renderSidebar({ permisos: EMPLEADO_LIKE })

    expect(screen.getByRole('link', { name: /asistencia/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /nómina/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /empleados/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /configuración/i })).not.toBeInTheDocument()
  })

  it('ordena el menú por grupos: Inicio, Personal, Operación y Administración', () => {
    renderSidebar()

    const nav = screen.getByRole('navigation', { name: 'Menú principal' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual([
      'Inicio',
      'Empleados',
      'Reclutamiento',
      'Evaluaciones',
      'Asistencia',
      'Horarios',
      'Mi horario',
      'Nómina',
      'Configuración',
    ])
  })

  it('con todos los permisos muestra los tres rótulos de grupo', () => {
    renderSidebar()

    for (const rotulo of ['Personal', 'Operación', 'Administración']) {
      expect(screen.getByText(rotulo)).toBeInTheDocument()
    }
  })

  it('no muestra el rótulo de un grupo sin zonas visibles', () => {
    renderSidebar({ permisos: EMPLEADO_LIKE })

    expect(screen.queryByText('Personal')).not.toBeInTheDocument()
    expect(screen.getByText('Operación')).toBeInTheDocument()
    expect(screen.getByText('Administración')).toBeInTheDocument()
  })

  it('sin permisos no muestra ningún rótulo de grupo', () => {
    renderSidebar({ permisos: [] })

    for (const rotulo of ['Personal', 'Operación', 'Administración']) {
      expect(screen.queryByText(rotulo)).not.toBeInTheDocument()
    }
  })

  it('la identidad de la empresa ya no vive en el sidebar (está en la barra superior)', () => {
    renderSidebar()

    expect(screen.queryByText(EMPRESA)).not.toBeInTheDocument()
  })

  it('marca la zona activa por coincidencia exacta', () => {
    renderSidebar({ permisos: [] })

    expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marca la zona activa en subrutas', () => {
    mockUsePathname.mockReturnValue('/employees/123')
    renderSidebar({ permisos: [PERMISOS.EMPLEADOS_READ] })

    expect(screen.getByRole('link', { name: /empleados/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /inicio/i })).not.toHaveAttribute('aria-current')
  })

  it('expandido mide el ancho completo y no tiene tooltips', () => {
    const { container } = renderSidebar()
    const aside = container.querySelector('aside')

    expect(aside?.className).toContain('w-64')
    expect(aside?.className).not.toContain('w-[76px]')
    expect(screen.getByRole('link', { name: /empleados/i })).not.toHaveAttribute('data-tooltip')
  })

  it('colapsado pasa a riel de íconos y sigue siendo usable (no inerte)', () => {
    const { container } = renderSidebar({ collapsed: true })
    const aside = container.querySelector('aside')

    expect(aside?.className).toContain('w-[76px]')
    expect(aside?.className).not.toContain('w-64')
    expect(aside?.hasAttribute('inert')).toBe(false)
    // La etiqueta sigue en el DOM: el link conserva su nombre accesible.
    expect(screen.getByRole('link', { name: /empleados/i })).toHaveAttribute(
      'data-tooltip',
      'Empleados'
    )
  })

  it('en el riel, pasar el puntero por un ícono muestra su nombre', () => {
    renderSidebar({ collapsed: true })

    fireEvent.pointerOver(screen.getByRole('link', { name: /empleados/i }), {
      pointerType: 'mouse',
    })

    const tooltip = document.querySelector('[data-rail-tooltip]')
    expect(tooltip).toHaveTextContent('Empleados')
  })

  it('el aside tiene el id que apunta el botón de colapsar', () => {
    const { container } = renderSidebar()

    expect(container.querySelector('aside')).toHaveAttribute('id', 'app-sidebar')
  })

  it('en /settings entra en modo configuración: menú de Configuración en lugar del principal', () => {
    mockUsePathname.mockReturnValue('/settings/employees/positions')
    renderSidebar()

    expect(screen.getByRole('link', { name: /volver/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /puestos/i })).toHaveAttribute('aria-current', 'page')
    // La cabecera cambia: "Configuración" y la empresa que se configura.
    expect(screen.getByText('Configuración')).toBeInTheDocument()
    expect(screen.getByText(EMPRESA)).toBeInTheDocument()
    // El menú principal no se muestra.
    expect(screen.queryByRole('link', { name: /inicio/i })).not.toBeInTheDocument()
  })

  it('en modo configuración el botón de búsqueda abre el buscador', async () => {
    mockUsePathname.mockReturnValue('/settings/general')
    renderSidebar()

    await userEvent.click(screen.getByRole('button', { name: /buscar ajuste/i }))
    expect(openSearch).toHaveBeenCalledTimes(1)
  })
})
