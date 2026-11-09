import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'
import { RolesPanel } from './RolesPanel'
import type { RoleSummary, RolesSettings } from './types'

vi.mock('nextjs-nav-guard', () => ({
  NavigationGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useNavigationGuard: vi.fn(),
}))
let params = new URLSearchParams()
const push = vi.fn((url: string) => {
  params = new URLSearchParams(url.split('?')[1] ?? '')
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn() }),
  usePathname: () => '/settings/roles',
  useSearchParams: () => params,
}))

const rol = (
  id: number,
  nombre: string,
  sistema: boolean,
  sucursalId: number | null = null
): RoleSummary => ({
  id,
  nombre,
  descripcion: null,
  sistema,
  asignable: true,
  sucursalId,
  sucursalNombre: null,
  baseId: null,
  baseNombre: null,
  permisos: [],
  usuarios: 0,
})

const data: RolesSettings = {
  propios: [
    rol(40, 'Supervisor de Tienda', false),
    rol(41, 'Cajero Infinity', false, 10),
    rol(42, 'Cajero Alex', false, 11),
  ],
  sistema: [rol(1, 'Administrador de Empresa', true), rol(9, 'Auditor Interno', true)],
  sucursales: [
    { id: 10, nombre: 'Tienda Infinity', activa: true },
    { id: 11, nombre: 'Celulares Alex', activa: true },
  ],
  actorRolId: 1,
  actorPermisos: [],
}

const renderPanel = () =>
  render(
    <UnsavedChangesProvider>
      <RolesPanel data={data} />
    </UnsavedChangesProvider>
  )

beforeEach(() => {
  params = new URLSearchParams()
  push.mockClear()
})

const buscar = () => screen.getByRole('searchbox', { name: 'Buscar rol' })

const tabNames = () =>
  within(screen.getByRole('tablist', { name: 'Filtrar roles por sucursal' }))
    .getAllByRole('tab')
    .map((t) => t.textContent ?? '')

const nombresEnPanel = () =>
  within(screen.getByRole('tabpanel'))
    .getAllByRole('listitem')
    .map((li) => within(li).getAllByText(/./)[0].textContent)

describe('RolesPanel · pestañas', () => {
  it('Todas lista primero los del sistema y después los creados en la empresa', () => {
    renderPanel()
    expect(nombresEnPanel()).toEqual([
      'Administrador de Empresa',
      'Auditor Interno',
      'Supervisor de Tienda',
      'Cajero Infinity',
      'Cajero Alex',
    ])
  })

  it('hay una pestaña por sucursal, más Todas y Toda la empresa', () => {
    renderPanel()
    const tabs = tabNames().join('|')
    expect(tabs).toContain('Todas (5)')
    expect(tabs).toContain('Toda la empresa (3)')
    expect(tabs).toContain('Tienda Infinity')
    expect(tabs).toContain('Celulares Alex')
  })

  it('una sucursal muestra los roles como aplican ahí: su versión reemplaza al general', () => {
    const version = {
      ...rol(43, 'Administrador de Empresa · Tienda Infinity', false, 10),
      baseId: 1,
      baseNombre: 'Administrador de Empresa',
      sucursalNombre: 'Tienda Infinity',
    }
    params = new URLSearchParams('tab=sucursal-10')
    render(
      <UnsavedChangesProvider>
        <RolesPanel data={{ ...data, propios: [...data.propios, version] }} />
      </UnsavedChangesProvider>
    )
    const panel = screen.getByRole('tabpanel')
    // Una sola vez, con nombre limpio y apuntando a la versión de la sucursal.
    const admin = within(panel).getAllByRole('link', { name: 'Administrador de Empresa' })
    expect(admin).toHaveLength(1)
    expect(admin[0]).toHaveAttribute('href', '/settings/roles/43')
    expect(within(panel).queryByText(/Versión de/)).not.toBeInTheDocument()
    // Generales + los creados solo para esta sucursal; nada de otras tiendas.
    expect(within(panel).getByText('Auditor Interno')).toBeInTheDocument()
    expect(within(panel).getByText('Supervisor de Tienda')).toBeInTheDocument()
    expect(within(panel).getByText('Cajero Infinity')).toBeInTheDocument()
    expect(within(panel).queryByText('Cajero Alex')).not.toBeInTheDocument()
  })
})

describe('RolesPanel · búsqueda', () => {
  it('filtra por nombre sin distinguir mayúsculas ni tildes', async () => {
    renderPanel()
    await userEvent.type(buscar(), 'AUDÍTOR')
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Auditor Interno')).toBeInTheDocument()
    expect(within(panel).queryByText('Administrador de Empresa')).not.toBeInTheDocument()
    expect(tabNames().join('|')).toContain('Todas (1)')
  })

  it('avisa cuando ningún rol coincide', async () => {
    renderPanel()
    await userEvent.type(buscar(), 'contador')
    expect(within(screen.getByRole('tabpanel')).getByRole('status')).toHaveTextContent(
      'Ningún rol se llama así'
    )
  })
})
