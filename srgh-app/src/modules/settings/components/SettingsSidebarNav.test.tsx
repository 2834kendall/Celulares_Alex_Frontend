import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsSidebarNav } from './SettingsSidebarNav'
import { PERMISOS } from '@/lib/permissions/catalog'

const mockUsePathname = vi.fn<() => string>()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

const ADMIN = [PERMISOS.EMPRESAS_WRITE, PERMISOS.CATALOGOS_WRITE, PERMISOS.USUARIOS_WRITE]

function renderNav(permisos: string[] = ADMIN) {
  const onOpenSearch = vi.fn()
  const onNavigate = vi.fn()
  render(
    <SettingsSidebarNav permisos={permisos} onOpenSearch={onOpenSearch} onNavigate={onNavigate} />
  )
  return { onOpenSearch, onNavigate }
}

describe('<SettingsSidebarNav />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mockUsePathname.mockReturnValue('/settings/employees/positions')
  })

  it('agrupa en Empresa y Módulos', () => {
    renderNav()

    expect(screen.getByText('Empresa')).toBeInTheDocument()
    expect(screen.getByText('Módulos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute(
      'href',
      '/settings/general'
    )
  })

  it('el módulo de la página actual arranca desplegado y su ajuste marcado', () => {
    renderNav()

    expect(screen.getByRole('button', { name: /empleados/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByRole('link', { name: 'Puestos' })).toHaveAttribute('aria-current', 'page')
  })

  it('los demás módulos arrancan plegados y se despliegan con un clic', async () => {
    renderNav()

    const asistencia = screen.getByRole('button', { name: /asistencia/i })
    expect(asistencia).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Tipos de tardía' })).not.toBeInTheDocument()

    await userEvent.click(asistencia)

    expect(asistencia).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Tipos de tardía' })).toHaveAttribute(
      'href',
      '/settings/attendance/tardiness-types'
    )
  })

  it('el módulo actual también se puede plegar', async () => {
    renderNav()

    await userEvent.click(screen.getByRole('button', { name: /empleados/i }))

    expect(screen.queryByRole('link', { name: 'Puestos' })).not.toBeInTheDocument()
  })

  it('oculta los módulos sin ajustes visibles', () => {
    renderNav([PERMISOS.USUARIOS_WRITE])

    expect(screen.queryByRole('button', { name: /reclutamiento/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'General' })).not.toBeInTheDocument()
  })

  it('"Volver" lleva al inicio si no hay una pantalla guardada', () => {
    renderNav()

    expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute('href', '/dashboard')
  })

  it('"Volver" lleva a la última pantalla fuera de Configuración', () => {
    window.sessionStorage.setItem('sgrh:settings-return-path', '/employees?tab=usuarios')
    renderNav()

    expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute(
      'href',
      '/employees?tab=usuarios'
    )
  })

  it('el botón de búsqueda abre el buscador', async () => {
    const { onOpenSearch } = renderNav()

    await userEvent.click(screen.getByRole('button', { name: /buscar ajuste/i }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('navegar avisa (para cerrar el drawer móvil)', async () => {
    const { onNavigate } = renderNav()

    await userEvent.click(screen.getByRole('link', { name: 'General' }))

    expect(onNavigate).toHaveBeenCalled()
  })
})
