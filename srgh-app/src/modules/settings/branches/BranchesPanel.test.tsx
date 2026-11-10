import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BranchesPanel } from './BranchesPanel'
import type { BranchSettings } from './types'

const replace = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}))

const CON_MARCAS = {
  branches: [
    { suc_id: 10, suc_nombre: 'Mall', suc_marca_id: 1, suc_activa: true },
    { suc_id: 20, suc_nombre: 'Centro', suc_marca_id: 2, suc_activa: true },
    { suc_id: 30, suc_nombre: 'Huérfana', suc_marca_id: null, suc_activa: true },
  ],
  brands: [
    { id: 1, nombre: 'Celulares Alex', activa: true },
    { id: 2, nombre: 'Infinity', activa: true },
    { id: 3, nombre: 'Vieja', activa: false },
  ],
  kiosks: [],
  legacy: [],
  audit: [],
  canManageKiosks: false,
} as unknown as BranchSettings

beforeEach(() => {
  vi.clearAllMocks()
  search = ''
})

describe('branch listing', () => {
  it('finds inactive branches by code and retains their detail links', async () => {
    const data = {
      branches: [
        { suc_id: 10, suc_nombre: 'Centro', suc_codigo_interno: 'CEN', suc_activa: true },
        { suc_id: 20, suc_nombre: 'Norte', suc_codigo_interno: 'NOR', suc_activa: false },
      ],
      kiosks: [],
      legacy: [],
      audit: [],
      canManageKiosks: true,
    } as unknown as BranchSettings
    render(<BranchesPanel data={data} />)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Estado de la sucursal' }),
      'inactivas'
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar sucursal' }), 'nor')
    expect(screen.getByRole('link', { name: /Norte/ })).toHaveAttribute(
      'href',
      '/settings/branches/20'
    )
    expect(screen.queryByRole('link', { name: /Centro/ })).not.toBeInTheDocument()
  })

  it('agrupa por marca y muestra aparte las que todavía no tienen', () => {
    render(<BranchesPanel data={CON_MARCAS} />)
    const alex = screen.getByRole('region', { name: 'Celulares Alex' })
    expect(within(alex).getByRole('link', { name: /Mall/ })).toBeInTheDocument()
    expect(within(alex).queryByRole('link', { name: /Centro/ })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Sin marca' })).getByRole('link', {
        name: /Huérfana/,
      })
    ).toBeInTheDocument()
  })

  it('busca también por el nombre de la marca', async () => {
    render(<BranchesPanel data={CON_MARCAS} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar sucursal' }), 'infinity')
    expect(screen.getByRole('link', { name: /Centro/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Mall/ })).not.toBeInTheDocument()
  })
})

describe('branch listing — filtro de marca en la URL', () => {
  it('llega filtrado desde una marca', () => {
    search = 'marca=2'
    render(<BranchesPanel data={CON_MARCAS} />)
    expect(screen.getByRole('combobox', { name: 'Marca' })).toHaveValue('2')
    expect(screen.getByRole('link', { name: /Centro/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Mall/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Sin marca' })).not.toBeInTheDocument()
  })

  it('crear y abrir una sucursal conservan el filtro', () => {
    search = 'marca=2'
    render(<BranchesPanel data={CON_MARCAS} />)
    expect(screen.getByRole('link', { name: 'Nueva sucursal' })).toHaveAttribute(
      'href',
      '/settings/branches/new?marca=2'
    )
    expect(screen.getByRole('link', { name: /Centro/ })).toHaveAttribute(
      'href',
      '/settings/branches/20?marca=2'
    )
  })

  it('sin filtro, los enlaces no llevan consulta', () => {
    render(<BranchesPanel data={CON_MARCAS} />)
    expect(screen.getByRole('link', { name: 'Nueva sucursal' })).toHaveAttribute(
      'href',
      '/settings/branches/new'
    )
  })

  it('cambiar el filtro cambia la URL', async () => {
    render(<BranchesPanel data={CON_MARCAS} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Marca' }), '2')
    expect(replace).toHaveBeenCalledWith('/settings/branches?marca=2', { scroll: false })
  })

  it('volver a todas limpia la URL', async () => {
    search = 'marca=2'
    render(<BranchesPanel data={CON_MARCAS} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Marca' }), 'todas')
    expect(replace).toHaveBeenCalledWith('/settings/branches', { scroll: false })
  })

  // Una URL vieja o escrita a mano no puede dejar la lista vacía sin explicación.
  it('ignora una marca que no existe', () => {
    search = 'marca=999'
    render(<BranchesPanel data={CON_MARCAS} />)
    expect(screen.getByRole('combobox', { name: 'Marca' })).toHaveValue('todas')
    expect(screen.getByRole('link', { name: /Mall/ })).toBeInTheDocument()
  })

  it('marca las inactivas en el filtro', () => {
    render(<BranchesPanel data={CON_MARCAS} />)
    expect(screen.getByRole('option', { name: 'Vieja (inactiva)' })).toBeInTheDocument()
  })
})
