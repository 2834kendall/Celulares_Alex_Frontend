import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsSidebarNav } from './SettingsSidebarNav'
import { PERMISOS } from '@/lib/permissions/catalog'

const mockUsePathname = vi.fn<() => string>()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

const ADMIN = [PERMISOS.EMPRESAS_WRITE, PERMISOS.CATALOGOS_WRITE, PERMISOS.USUARIOS_WRITE]

function renderNav(permisos: string[] = ADMIN, collapsed = false) {
  const onOpenSearch = vi.fn()
  const onNavigate = vi.fn()
  const view = render(
    <SettingsSidebarNav
      permisos={permisos}
      collapsed={collapsed}
      onOpenSearch={onOpenSearch}
      onNavigate={onNavigate}
    />
  )
  const rerenderCollapsed = (next: boolean) =>
    view.rerender(
      <SettingsSidebarNav
        permisos={permisos}
        collapsed={next}
        onOpenSearch={onOpenSearch}
        onNavigate={onNavigate}
      />
    )
  return { onOpenSearch, onNavigate, rerenderCollapsed }
}

const renderRail = () => renderNav(ADMIN, true)
const flyout = (name: string) => screen.queryByRole('group', { name })

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

  it('expandido no lleva tooltips', () => {
    renderNav()

    expect(screen.getByRole('link', { name: /volver/i })).not.toHaveAttribute('data-tooltip')
    expect(screen.getByRole('button', { name: /buscar ajuste/i })).not.toHaveAttribute(
      'data-tooltip'
    )
  })

  describe('en el riel', () => {
    it('las etiquetas se desvanecen pero siguen siendo el nombre accesible', () => {
      renderRail()

      const general = screen.getByRole('link', { name: 'General' })
      expect(general).toHaveAttribute('data-tooltip', 'General')
      expect(within(general).getByText('General')).toHaveClass('opacity-0')
      expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute(
        'data-tooltip',
        'Volver al menú principal'
      )
    })

    it('la búsqueda queda como lupa con su atajo en el tooltip', async () => {
      const { onOpenSearch } = renderRail()
      const search = screen.getByRole('button', { name: /buscar ajuste/i })

      expect(search).toHaveAttribute('data-tooltip', 'Buscar ajuste (Ctrl K)')
      expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K')

      await userEvent.click(search)
      expect(onOpenSearch).toHaveBeenCalledTimes(1)
    })

    it('un módulo abre sus subpáginas en un panel al costado, no en línea', async () => {
      renderRail()
      const reclutamiento = screen.getByRole('button', { name: /reclutamiento/i })
      expect(reclutamiento).toHaveAttribute('data-tooltip', 'Reclutamiento')

      await userEvent.click(reclutamiento)

      const panel = flyout('Reclutamiento')!
      expect(reclutamiento).toHaveAttribute('aria-expanded', 'true')
      expect(reclutamiento).toHaveAttribute('aria-controls', panel.id)
      expect(
        within(panel)
          .getAllByRole('link')
          .map((link) => link.textContent)
      ).toEqual(['Etapas de selección', 'Criterios de selección'])
      // Con el panel abierto, su encabezado ya dice el nombre.
      expect(reclutamiento).not.toHaveAttribute('data-tooltip')
    })

    it('volver a tocar el módulo cierra el panel', async () => {
      renderRail()
      const reclutamiento = screen.getByRole('button', { name: /reclutamiento/i })

      await userEvent.click(reclutamiento)
      await userEvent.click(reclutamiento)

      expect(flyout('Reclutamiento')).not.toBeInTheDocument()
      expect(reclutamiento).toHaveAttribute('aria-expanded', 'false')
    })

    it('abrir otro módulo cambia el panel', async () => {
      renderRail()

      await userEvent.click(screen.getByRole('button', { name: /reclutamiento/i }))
      await userEvent.click(screen.getByRole('button', { name: /asistencia/i }))

      expect(flyout('Reclutamiento')).not.toBeInTheDocument()
      expect(flyout('Asistencia')).toBeInTheDocument()
    })

    it('navegar desde el panel lo cierra y avisa', async () => {
      const { onNavigate } = renderRail()

      await userEvent.click(screen.getByRole('button', { name: /asistencia/i }))
      await userEvent.click(screen.getByRole('link', { name: 'Tipos de tardía' }))

      expect(onNavigate).toHaveBeenCalledTimes(1)
      expect(flyout('Asistencia')).not.toBeInTheDocument()
    })

    it('el panel marca la página actual', async () => {
      renderRail()

      await userEvent.click(screen.getByRole('button', { name: /empleados/i }))

      expect(within(flyout('Empleados')!).getByRole('link', { name: 'Puestos' })).toHaveAttribute(
        'aria-current',
        'page'
      )
    })

    it('el módulo de la página actual se marca entero, sin lista en línea', () => {
      renderRail()

      expect(screen.getByRole('button', { name: /empleados/i })).toHaveClass('bg-brand-700')
      expect(screen.getByRole('button', { name: /asistencia/i })).not.toHaveClass('bg-brand-700')
      // En el riel no hay despliegue en línea, aunque sea el módulo actual.
      expect(screen.queryByRole('link', { name: 'Puestos' })).not.toBeInTheDocument()
    })

    it('al expandir, el panel se descarta y los módulos vuelven a desplegarse en línea', async () => {
      const { rerenderCollapsed } = renderRail()
      await userEvent.click(screen.getByRole('button', { name: /reclutamiento/i }))

      rerenderCollapsed(false)

      expect(flyout('Reclutamiento')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /empleados/i })).toHaveAttribute(
        'aria-expanded',
        'true'
      )
      expect(screen.getByRole('link', { name: 'Puestos' })).toBeInTheDocument()
    })

    it('con teclado, el foco entra al panel', async () => {
      renderRail()
      screen.getByRole('button', { name: /reclutamiento/i }).focus()

      await userEvent.keyboard('{Enter}')

      expect(screen.getByRole('link', { name: 'Etapas de selección' })).toHaveFocus()
    })
  })
})
