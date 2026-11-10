import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { redirect } from 'next/navigation'
import { toast } from 'sonner'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { setContextoMarca } from '@/modules/settings/actions/setContextoMarca'
import { ContextoBanner, ContextoSwitcher } from './ContextoSwitcher'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@/modules/settings/actions/setContextoMarca', () => ({ setContextoMarca: vi.fn() }))

const MARCAS = [
  { id: 1, nombre: 'Celulares Alex', colorAcento: null, colorSidebar: null, logoPath: null },
  { id: 2, nombre: 'Infinity', colorAcento: null, colorSidebar: null, logoPath: null },
]

async function elegirInfinity() {
  await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
  await userEvent.click(screen.getByRole('button', { name: 'Infinity' }))
}

function FormularioConCambios() {
  useUnsavedChanges({ label: 'el formulario', dirty: true })
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(setContextoMarca).mockResolvedValue({ ok: true })
})

describe('ContextoSwitcher', () => {
  it('muestra "Todas las marcas" cuando no hay marca elegida', () => {
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={null} />)
    expect(screen.getByRole('button', { name: 'Marca' })).toHaveTextContent('Todas las marcas')
  })

  it('muestra la marca elegida', () => {
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={2} />)
    expect(screen.getByRole('button', { name: 'Marca' })).toHaveTextContent('Infinity')
  })

  it('sin marcas no se muestra', () => {
    render(<ContextoSwitcher marcas={[]} marcaContextoId={null} />)
    expect(screen.queryByRole('button', { name: 'Marca' })).not.toBeInTheDocument()
  })

  it('la variante del menú móvil también filtra', async () => {
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={null} variant="block" />)
    await elegirInfinity()
    await waitFor(() => expect(setContextoMarca).toHaveBeenCalledWith(2))
  })

  it('elegir una marca la fija', async () => {
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={null} />)
    await elegirInfinity()
    await waitFor(() => expect(setContextoMarca).toHaveBeenCalledWith(2))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('"Todas las marcas" quita el filtro', async () => {
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
    await userEvent.click(screen.getByRole('button', { name: 'Todas las marcas' }))
    await waitFor(() => expect(setContextoMarca).toHaveBeenCalledWith(null))
  })

  it('si la acción la rechaza, muestra su error', async () => {
    vi.mocked(setContextoMarca).mockResolvedValue({ ok: false, error: 'No podés.' })
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={null} />)
    await elegirInfinity()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No podés.'))
  })

  it('sin conexión avisa en vez de caer en la pantalla de error', async () => {
    vi.mocked(setContextoMarca).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={null} />)
    await elegirInfinity()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No se pudo cambiar la marca. Revisá la conexión y reintentá.'
      )
    )
  })

  it('una redirección no se presenta como un fallo', async () => {
    let redireccion: unknown
    try {
      redirect('/unauthorized')
    } catch (error) {
      redireccion = error
    }
    vi.mocked(setContextoMarca).mockRejectedValue(redireccion)
    render(<ContextoSwitcher marcas={MARCAS} marcaContextoId={null} />)
    await elegirInfinity()
    await waitFor(() => expect(setContextoMarca).toHaveBeenCalled())
    await act(async () => {
      await Promise.resolve()
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('con cambios sin guardar pide confirmación antes de cambiar', async () => {
    render(
      <UnsavedChangesProvider>
        <FormularioConCambios />
        <ContextoSwitcher marcas={MARCAS} marcaContextoId={null} />
      </UnsavedChangesProvider>
    )
    await elegirInfinity()
    const salir = await screen.findByRole('button', { name: 'Salir sin guardar' })
    expect(setContextoMarca).not.toHaveBeenCalled()

    await userEvent.click(salir)
    await waitFor(() => expect(setContextoMarca).toHaveBeenCalledWith(2))
  })
})

describe('ContextoBanner', () => {
  it('avisa que se ve solo esa marca', () => {
    render(<ContextoBanner marcaNombre="Infinity" />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Viendo solo Infinity. Los totales son de esta marca.'
    )
  })

  it('"Ver todas" quita el filtro', async () => {
    render(<ContextoBanner marcaNombre="Infinity" />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver todas' }))
    await waitFor(() => expect(setContextoMarca).toHaveBeenCalledWith(null))
  })

  it('con cambios sin guardar, "Ver todas" también pide confirmación', async () => {
    render(
      <UnsavedChangesProvider>
        <FormularioConCambios />
        <ContextoBanner marcaNombre="Infinity" />
      </UnsavedChangesProvider>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ver todas' }))
    expect(await screen.findByRole('button', { name: 'Salir sin guardar' })).toBeInTheDocument()
    expect(setContextoMarca).not.toHaveBeenCalled()
  })
})
