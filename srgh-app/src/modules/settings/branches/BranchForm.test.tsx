import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'
import { TERRITORIO } from '@/modules/employees/components/testFixtures'
import { BranchForm } from './BranchForm'
import { saveBranch } from './actions'
import type { Branch, BranchBrand } from './types'

vi.mock('./actions', () => ({ saveBranch: vi.fn() }))
vi.mock('nextjs-nav-guard', () => ({
  NavigationGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useNavigationGuard: vi.fn(),
}))
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/settings/branches/new',
}))

const BRANDS: BranchBrand[] = [
  { id: 1, nombre: 'Celulares Alex', activa: true },
  { id: 2, nombre: 'Infinity', activa: true },
  { id: 3, nombre: 'Vieja', activa: false },
]

function renderForm(props: Partial<Parameters<typeof BranchForm>[0]> = {}) {
  return render(
    <UnsavedChangesProvider>
      <BranchForm territorio={TERRITORIO} brands={BRANDS} {...props} />
    </UnsavedChangesProvider>
  )
}

const marcaTrigger = () => screen.getByRole('button', { name: /Marca/ })

async function openBrandOptions() {
  await userEvent.click(marcaTrigger())
  return screen.getAllByRole('option').map((o) => o.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BranchForm — marca', () => {
  it('no guarda una sucursal sin marca', async () => {
    renderForm()
    await userEvent.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Mall')
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }))
    expect(await screen.findByText('Elegí la marca de la sucursal.')).toBeInTheDocument()
    expect(saveBranch).not.toHaveBeenCalled()
  })

  it('ofrece solo las marcas activas al crear', async () => {
    renderForm()
    expect(await openBrandOptions()).toEqual(['Celulares Alex', 'Infinity'])
  })

  it('trae preseleccionada la marca desde la que se vino', () => {
    renderForm({ defaultBrandId: 2 })
    expect(marcaTrigger()).toHaveTextContent('Infinity')
  })

  it('ignora una preselección que no es una marca activa', () => {
    renderForm({ defaultBrandId: 3 })
    expect(marcaTrigger()).not.toHaveTextContent('Vieja')
  })

  it('conserva y muestra la marca inactiva que la sucursal ya tiene', async () => {
    const branch = {
      suc_id: 10,
      suc_nombre: 'Centro',
      suc_marca_id: 3,
      suc_activa: true,
      suc_radio_geocerca_metros: 50,
      direccion: null,
    } as unknown as Branch
    renderForm({ branch })
    expect(marcaTrigger()).toHaveTextContent('Vieja (inactiva)')
    expect(await openBrandOptions()).toEqual(['Celulares Alex', 'Infinity', 'Vieja (inactiva)'])
  })

  it('manda la marca elegida al guardar', async () => {
    vi.mocked(saveBranch).mockResolvedValue({ ok: false, error: 'corte' })
    const branch = {
      suc_id: 10,
      suc_nombre: 'Centro',
      suc_codigo_interno: null,
      suc_telefono: null,
      suc_email_sucursal: null,
      suc_latitud: null,
      suc_longitud: null,
      suc_marca_id: 1,
      suc_activa: true,
      suc_radio_geocerca_metros: 50,
      direccion: {
        dir_distrito_id: TERRITORIO.distritos[0].id,
        dir_senas_exactas: 'Cien metros norte',
      },
    } as unknown as Branch
    renderForm({ branch })
    await userEvent.click(marcaTrigger())
    await userEvent.click(screen.getByRole('button', { name: 'Infinity' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(saveBranch).toHaveBeenCalled())
    expect(vi.mocked(saveBranch).mock.calls[0]).toEqual([
      10,
      expect.objectContaining({ suc_marca_id: 2 }),
    ])
  })

  it('al crear, preselecciona la marca si es la única que se puede elegir', () => {
    renderForm({ brands: [BRANDS[0], BRANDS[2]] })
    expect(marcaTrigger()).toHaveTextContent('Celulares Alex')
  })

  it('con varias marcas no elige por el usuario', () => {
    renderForm()
    expect(marcaTrigger()).not.toHaveTextContent('Celulares Alex')
    expect(marcaTrigger()).not.toHaveTextContent('Infinity')
  })

  it('al editar, nunca cambia la marca por ser la única activa', () => {
    const branch = {
      suc_id: 10,
      suc_nombre: 'Centro',
      suc_marca_id: 3,
      suc_activa: true,
      suc_radio_geocerca_metros: 50,
      direccion: null,
    } as unknown as Branch
    renderForm({ branch, brands: [BRANDS[0], BRANDS[2]] })
    expect(marcaTrigger()).toHaveTextContent('Vieja (inactiva)')
  })

  it('volver y guardar conservan el filtro del listado', async () => {
    vi.mocked(saveBranch).mockResolvedValue({ ok: true, data: 10 })
    const branch = {
      suc_id: 10,
      suc_nombre: 'Centro',
      suc_codigo_interno: null,
      suc_telefono: null,
      suc_email_sucursal: null,
      suc_latitud: null,
      suc_longitud: null,
      suc_marca_id: 1,
      suc_activa: true,
      suc_radio_geocerca_metros: 50,
      direccion: {
        dir_distrito_id: TERRITORIO.distritos[0].id,
        dir_senas_exactas: 'Cien metros norte',
      },
    } as unknown as Branch
    renderForm({ branch, listQuery: '?marca=1' })

    await userEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))
    expect(push).toHaveBeenLastCalledWith('/settings/branches?marca=1')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(push).toHaveBeenLastCalledWith('/settings/branches/10?marca=1'))
  })

  it('sin ninguna marca activa manda a Marcas en vez de mostrar el formulario', () => {
    renderForm({ brands: [{ id: 3, nombre: 'Vieja', activa: false }] })
    expect(screen.getByRole('link', { name: 'Ir a Marcas' })).toHaveAttribute(
      'href',
      '/settings/profile?tab=marcas'
    )
    expect(screen.queryByRole('button', { name: 'Crear sucursal' })).not.toBeInTheDocument()
  })
})
