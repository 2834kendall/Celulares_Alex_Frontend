import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { redirect } from 'next/navigation'
import { setMarcaPreview } from '@/modules/settings/actions/setMarcaPreview'
import { BrandsPanel } from './BrandsPanel'
import { deleteBrand, saveBrand, saveBrandApariencia } from './actions'
import type { Brand, BrandsEmpresa } from './types'

const refresh = vi.fn()

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh }),
  usePathname: () => '/settings/profile',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/settings/actions/setMarcaPreview', () => ({ setMarcaPreview: vi.fn() }))
vi.mock('./actions', () => ({
  deleteBrand: vi.fn(),
  removeBrandLogo: vi.fn(),
  saveBrand: vi.fn(),
  saveBrandApariencia: vi.fn(),
  setBrandLogo: vi.fn(),
}))

const EMPRESA: BrandsEmpresa = {
  acento: '#166534',
  sidebar: '#f1efe8',
  logoUrl: 'https://firmada/empresa',
}

function marca(overrides: Partial<Brand>): Brand {
  return {
    mco_id: 1,
    mco_nombre: 'Celulares Alex',
    mco_activa: true,
    mco_color_acento: null,
    mco_color_sidebar: null,
    mco_logo_path: null,
    mco_empresa_id: 1,
    mco_created_at: '',
    mco_updated_at: '',
    sucursales: [],
    logoUrl: null,
    ...overrides,
  }
}

const CON_SUCURSALES = marca({
  mco_id: 1,
  mco_nombre: 'Celulares Alex',
  mco_color_acento: '#1e40af',
  logoUrl: 'https://firmada/alex',
  sucursales: [
    { suc_id: 10, suc_nombre: 'Mall', suc_activa: true },
    { suc_id: 11, suc_nombre: 'Centro', suc_activa: true },
  ],
})
const SIN_SUCURSALES = marca({ mco_id: 2, mco_nombre: 'Por error' })
const INACTIVA = marca({ mco_id: 3, mco_nombre: 'Vieja', mco_activa: false })

function renderPanel(brands: Brand[] = [CON_SUCURSALES, SIN_SUCURSALES, INACTIVA]) {
  return render(<BrandsPanel data={{ brands }} empresa={EMPRESA} />)
}

const tarjeta = (nombre: string) =>
  screen.getByRole('button', { name: `Editar ${nombre}` }).closest('li') as HTMLElement

async function abrirMenu(nombre: string) {
  await userEvent.click(screen.getByRole('button', { name: `Más acciones de ${nombre}` }))
}

async function confirmarEliminar(nombre: string) {
  await abrirMenu(nombre)
  await userEvent.click(screen.getByRole('button', { name: 'Eliminar marca' }))
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
  )
}

/** El error real con el que rechaza una acción que redirigió (permiso perdido). */
function errorDeRedireccion(): unknown {
  try {
    redirect('/unauthorized')
  } catch (error) {
    return error
  }
}

/** Da tiempo a que termine la promesa rechazada: lo que se afirma es que NO hubo aviso. */
const esperarRechazo = (mock: ReturnType<typeof vi.fn>) =>
  waitFor(async () => {
    expect(mock).toHaveBeenCalled()
    await Promise.allSettled(mock.mock.results.map((r) => r.value))
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(deleteBrand).mockResolvedValue({ ok: true })
  vi.mocked(saveBrand).mockResolvedValue({ ok: true, data: 1 })
  vi.mocked(saveBrandApariencia).mockResolvedValue({ ok: true })
  vi.mocked(setMarcaPreview).mockResolvedValue({ ok: true })
})

describe('BrandsPanel — tarjetas', () => {
  it('enlaza a la lista de sucursales con el filtro de la marca', () => {
    renderPanel()
    expect(
      within(tarjeta('Celulares Alex')).getByRole('link', { name: /Ver 2 sucursales/ })
    ).toHaveAttribute('href', '/settings/branches?marca=1')
  })

  it('sin sucursales ofrece agregar una con la marca preseleccionada', () => {
    renderPanel()
    expect(
      within(tarjeta('Por error')).getByRole('link', { name: /Agregar sucursal/ })
    ).toHaveAttribute('href', '/settings/branches/new?marca=2')
  })

  it('una marca inactiva no ofrece agregar sucursales', () => {
    renderPanel()
    expect(within(tarjeta('Vieja')).queryByRole('link')).not.toBeInTheDocument()
    expect(within(tarjeta('Vieja')).getByText('Sin sucursales')).toBeInTheDocument()
  })

  it('dice de dónde sale cada cosa', () => {
    renderPanel()
    expect(
      within(tarjeta('Celulares Alex')).getByText(
        'Logo propio · Acento propio, barra de la empresa'
      )
    ).toBeInTheDocument()
    expect(
      within(tarjeta('Por error')).getByText('Logo de la empresa · Colores de la empresa')
    ).toBeInTheDocument()
  })

  it('sin logo propio muestra el de la empresa, como la app', () => {
    renderPanel()
    expect(within(tarjeta('Por error')).getByAltText('Logo de Por error')).toHaveAttribute(
      'src',
      EMPRESA.logoUrl
    )
    expect(
      within(tarjeta('Celulares Alex')).getByAltText('Logo de Celulares Alex')
    ).toHaveAttribute('src', 'https://firmada/alex')
  })

  it('pinta la tarjeta con los colores efectivos: los propios y los heredados', () => {
    renderPanel()
    const estilo = tarjeta('Celulares Alex').style
    expect(estilo.getPropertyValue('--color-brand-600')).toBe('#1e40af')
    expect(estilo.getPropertyValue('--sidebar-bg')).toBe(EMPRESA.sidebar)
  })

  it('tocar el logo abre su modal', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar logo de Por error' }))
    expect(screen.getByRole('dialog', { name: 'Logo de Por error' })).toBeInTheDocument()
  })
})

describe('BrandsPanel — eliminar', () => {
  it('una marca sin sucursales se elimina después de confirmar', async () => {
    renderPanel()
    await abrirMenu('Por error')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar marca' }))
    expect(deleteBrand).not.toHaveBeenCalled()

    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
    )

    await waitFor(() => expect(deleteBrand).toHaveBeenCalledWith(2))
    expect(toast.success).toHaveBeenCalledWith('Marca eliminada.')
    expect(refresh).toHaveBeenCalled()
  })

  it('una marca con sucursales explica por qué no y enlaza a ellas', async () => {
    renderPanel()
    await abrirMenu('Celulares Alex')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar marca' }))

    const dialogo = screen.getByRole('dialog', { name: 'No se puede eliminar Celulares Alex' })
    expect(within(dialogo).getByRole('link', { name: 'Ver sus sucursales' })).toHaveAttribute(
      'href',
      '/settings/branches?marca=1'
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteBrand).not.toHaveBeenCalled()
  })

  it('muestra el error de la RPC', async () => {
    vi.mocked(deleteBrand).mockResolvedValue({ ok: false, error: 'Tiene sucursales.' })
    renderPanel()
    await abrirMenu('Por error')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar marca' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' })
    )

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tiene sucursales.'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  // El diálogo ya cerró: sin este aviso la marca sigue ahí y nadie dice por qué.
  it('si se cae la red, avisa en vez de fallar en silencio', async () => {
    vi.mocked(deleteBrand).mockRejectedValue(new TypeError('Failed to fetch'))
    renderPanel()
    await confirmarEliminar('Por error')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Revisá la conexión'))
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('una redirección no se informa como falla', async () => {
    vi.mocked(deleteBrand).mockRejectedValue(errorDeRedireccion())
    renderPanel()
    await confirmarEliminar('Por error')

    await esperarRechazo(vi.mocked(deleteBrand))
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('BrandsPanel — ver la app con una marca', () => {
  it('es una acción explícita del menú', async () => {
    renderPanel()
    await abrirMenu('Celulares Alex')
    await userEvent.click(screen.getByRole('button', { name: 'Ver la app con esta marca' }))

    await waitFor(() => expect(setMarcaPreview).toHaveBeenCalledWith(1))
    expect(refresh).toHaveBeenCalled()
  })

  it('si se cae la red, avisa', async () => {
    vi.mocked(setMarcaPreview).mockRejectedValue(new TypeError('Failed to fetch'))
    renderPanel()
    await abrirMenu('Celulares Alex')
    await userEvent.click(screen.getByRole('button', { name: 'Ver la app con esta marca' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Revisá la conexión'))
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('una redirección no se informa como falla', async () => {
    vi.mocked(setMarcaPreview).mockRejectedValue(errorDeRedireccion())
    renderPanel()
    await abrirMenu('Celulares Alex')
    await userEvent.click(screen.getByRole('button', { name: 'Ver la app con esta marca' }))

    await esperarRechazo(vi.mocked(setMarcaPreview))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('una marca inactiva no se ofrece', async () => {
    renderPanel()
    await abrirMenu('Vieja')
    expect(
      screen.queryByRole('button', { name: 'Ver la app con esta marca' })
    ).not.toBeInTheDocument()
  })

  // Guardar ya no mueve el selector: cambiaba el tema de toda la app sin avisar.
  it('guardar colores no cambia la vista previa, solo la ofrece', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Colores de Celulares Alex' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(saveBrandApariencia).toHaveBeenCalled())
    expect(setMarcaPreview).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(
      'Apariencia actualizada.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Ver la app con esta marca' }),
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Colores/ })).not.toBeInTheDocument()
    )
  })
})

describe('BrandsPanel — colores', () => {
  it('guarda en la marca abierta y sigue heredando lo que no tenía propio', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Colores de Celulares Alex' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(saveBrandApariencia).toHaveBeenCalledWith(1, {
        colorAcento: '#1e40af',
        colorSidebar: null,
      })
    })
  })
})

describe('BrandsPanel — crear y editar', () => {
  it('si se cae la red, avisa y conserva lo escrito', async () => {
    vi.mocked(saveBrand).mockRejectedValue(new TypeError('Failed to fetch'))
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva marca' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva marca' })
    await userEvent.type(within(dialogo).getByLabelText('Nombre *'), 'Infinity')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear marca' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Revisá la conexión')
    expect(within(dialogo).getByLabelText('Nombre *')).toHaveValue('Infinity')
  })

  it('una redirección no se informa como falla', async () => {
    vi.mocked(saveBrand).mockRejectedValue(errorDeRedireccion())
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva marca' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva marca' })
    await userEvent.type(within(dialogo).getByLabelText('Nombre *'), 'Infinity')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear marca' }))

    await esperarRechazo(vi.mocked(saveBrand))
    await waitFor(() => {
      expect(within(dialogo).getByRole('button', { name: 'Crear marca' })).toBeEnabled()
    })
    expect(within(dialogo).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('crear pide solo el nombre', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva marca' }))

    const dialogo = screen.getByRole('dialog', { name: 'Nueva marca' })
    expect(within(dialogo).queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.type(within(dialogo).getByRole('textbox', { name: /Nombre/ }), 'Infinity')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear marca' }))

    await waitFor(() => {
      expect(saveBrand).toHaveBeenCalledWith(null, { mco_nombre: 'Infinity', mco_activa: true })
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nueva marca' })).not.toBeInTheDocument()
    )
  })

  it('muestra el error de nombre repetido sin cerrar', async () => {
    vi.mocked(saveBrand).mockResolvedValue({
      ok: false,
      error: 'Ya existe una marca con ese nombre.',
    })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva marca' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva marca' })
    await userEvent.type(within(dialogo).getByRole('textbox', { name: /Nombre/ }), 'Infinity')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear marca' }))

    expect(await within(dialogo).findByText('Ya existe una marca con ese nombre.')).toBeVisible()
  })

  // Guardar otro dato no puede desactivarla: la RPC rechazaría el cambio entero.
  it('con sucursales activas bloquea desactivar y guardar mantiene la marca activa', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Editar Celulares Alex' }))
    const dialogo = screen.getByRole('dialog', { name: 'Editar Celulares Alex' })

    const casilla = within(dialogo).getByRole('checkbox', { name: 'Marca activa' })
    expect(casilla).toBeDisabled()
    expect(casilla).toBeChecked()
    expect(within(dialogo).getByRole('link', { name: 'sus sucursales activas' })).toHaveAttribute(
      'href',
      '/settings/branches?marca=1'
    )

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => {
      expect(saveBrand).toHaveBeenCalledWith(1, {
        mco_nombre: 'Celulares Alex',
        mco_activa: true,
      })
    })
  })

  it('sin sucursales activas se puede desactivar', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Editar Por error' }))
    const dialogo = screen.getByRole('dialog', { name: 'Editar Por error' })

    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Marca activa' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(saveBrand).toHaveBeenCalledWith(2, { mco_nombre: 'Por error', mco_activa: false })
    })
  })

  it('sin marcas lo dice', () => {
    renderPanel([])
    expect(screen.getByText(/Todavía no hay marcas/)).toBeInTheDocument()
  })
})
