import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { redirect } from 'next/navigation'
import { deriveBrandTokens } from '@/lib/utils/color'
import { AppearanceForm } from './AppearanceForm'

const refresh = vi.fn()

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh }),
  usePathname: () => '/settings/profile',
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const EMPRESA = { acento: '#166534', sidebar: '#f1efe8' }
const NUEVO = '#9f1239'

const onSave = vi.fn()

function props(overrides: Partial<Parameters<typeof AppearanceForm>[0]> = {}) {
  return {
    descripcion: 'Se aplica a todas las tiendas de esta marca.',
    unsavedLabel: 'la apariencia de la marca',
    colorAcentoActual: null,
    colorSidebarActual: null,
    heredados: EMPRESA,
    heredarLabel: 'Usar el de la empresa',
    previewNombre: 'Infinity',
    previewLogoUrl: null,
    onSave,
    ...overrides,
  }
}

const acento = () => screen.getByRole('textbox', { name: 'Color de acento' })
const sidebar = () => screen.getByRole('textbox', { name: 'Color de la barra lateral' })
const heredar = () => screen.getAllByRole('checkbox', { name: 'Usar el de la empresa' })
const guardar = () => screen.getByRole('button', { name: 'Guardar cambios' })

async function escribir(campo: HTMLElement, valor: string) {
  await userEvent.clear(campo)
  await userEvent.type(campo, valor)
}

beforeEach(() => {
  vi.clearAllMocks()
  onSave.mockResolvedValue({ ok: true })
})

describe('AppearanceForm — herencia por color', () => {
  it('sin colores propios muestra los heredados reales, no los del sistema', () => {
    render(<AppearanceForm {...props()} />)

    expect(acento()).toHaveValue(EMPRESA.acento)
    expect(acento()).toBeDisabled()
    expect(sidebar()).toHaveValue(EMPRESA.sidebar)
    expect(sidebar()).toBeDisabled()
    heredar().forEach((casilla) => expect(casilla).toBeChecked())
  })

  /*
   * LA regresión de este formulario: siempre mandaba los dos colores, así que
   * personalizar solo el acento dejaba la barra fija en el color por defecto y
   * la marca dejaba de seguir a la empresa, sin que nadie lo pidiera.
   */
  it('personalizar solo el acento deja la barra heredando (null)', async () => {
    render(<AppearanceForm {...props()} />)

    await userEvent.click(heredar()[0])
    await escribir(acento(), NUEVO)
    await userEvent.click(guardar())

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ colorAcento: NUEVO, colorSidebar: null })
    })
  })

  it('volver a heredar un color lo guarda como null y conserva el otro', async () => {
    render(
      <AppearanceForm {...props({ colorAcentoActual: NUEVO, colorSidebarActual: '#1b2a41' })} />
    )

    await userEvent.click(heredar()[1])
    await userEvent.click(guardar())

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ colorAcento: NUEVO, colorSidebar: null })
    })
  })

  it('un color heredado no se puede cambiar con los predefinidos', () => {
    render(<AppearanceForm {...props()} />)

    expect(screen.getAllByRole('button', { name: 'Usar #1e40af' })[0]).toBeDisabled()
  })
})

describe('AppearanceForm — validación del color', () => {
  it('acepta un color sin numeral y lo guarda normalizado', async () => {
    render(<AppearanceForm {...props({ colorAcentoActual: NUEVO })} />)

    await escribir(acento(), '0891B2')
    await userEvent.click(guardar())

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ colorAcento: '#0891b2', colorSidebar: null })
    })
  })

  it('un color inválido se explica y no se puede guardar', async () => {
    render(<AppearanceForm {...props({ colorAcentoActual: NUEVO })} />)

    await escribir(acento(), 'rojo')

    expect(screen.getByText('Escribí un color como #0891B2.')).toBeInTheDocument()
    expect(acento()).toHaveAttribute('aria-invalid', 'true')
    expect(guardar()).toBeDisabled()
  })

  it('marca cuál predefinido está elegido', async () => {
    render(<AppearanceForm {...props({ colorAcentoActual: NUEVO })} />)
    const preset = screen.getByRole('button', { name: 'Usar #1e40af' })

    expect(preset).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(preset)

    expect(preset).toHaveAttribute('aria-pressed', 'true')
    expect(acento()).toHaveValue('#1e40af')
  })
})

describe('AppearanceForm — vista previa', () => {
  it('la maqueta sigue al color que se está eligiendo', async () => {
    render(<AppearanceForm {...props({ colorAcentoActual: '#1e40af' })} />)
    const maqueta = screen.getByRole('img', { name: /Infinity/ })

    await escribir(acento(), NUEVO)

    expect(maqueta.style.getPropertyValue('--color-brand-600')).toBe(
      deriveBrandTokens(NUEVO)['--color-brand-600']
    )
  })

  // Pintar el shell real dejaba la app con el color de prueba y mezclada con el
  // nombre y el logo de otra marca.
  it('no toca la app real mientras se elige', async () => {
    const shell = document.createElement('div')
    shell.id = 'app-shell-root'
    document.body.append(shell)
    render(<AppearanceForm {...props({ colorAcentoActual: '#1e40af' })} />)

    await escribir(acento(), NUEVO)

    expect(shell.style.length).toBe(0)
    shell.remove()
  })
})

describe('AppearanceForm — guardado', () => {
  it('avisa, refresca y cierra', async () => {
    const onSaved = vi.fn()
    render(<AppearanceForm {...props({ onSaved })} />)

    await userEvent.click(guardar())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Apariencia actualizada.', undefined)
    expect(refresh).toHaveBeenCalled()
  })

  it('ofrece la acción opcional en el aviso', async () => {
    const savedAction = { label: 'Ver la app con esta marca', onClick: vi.fn() }
    render(<AppearanceForm {...props({ savedAction })} />)

    await userEvent.click(guardar())

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Apariencia actualizada.',
        expect.objectContaining({ action: savedAction })
      )
    })
  })

  it('si falla, muestra el error y no cierra', async () => {
    onSave.mockResolvedValue({ ok: false, error: 'No se pudo guardar la apariencia.' })
    const onSaved = vi.fn()
    render(<AppearanceForm {...props({ onSaved })} />)

    await userEvent.click(guardar())

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No se pudo guardar la apariencia.')
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  /*
   * Se reprodujo en el navegador: al caerse la red, "Guardar" giraba para siempre,
   * "Cancelar" quedaba deshabilitado y la X decía "el guardado está en curso". La
   * única salida era recargar.
   */
  it('si se cae la red, avisa y no queda trabado', async () => {
    onSave.mockRejectedValue(new TypeError('Failed to fetch'))
    const onSaved = vi.fn()
    render(<AppearanceForm {...props({ onSaved, onCancel: vi.fn() })} />)

    await userEvent.click(guardar())

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Revisá la conexión'))
    })
    expect(guardar()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reintentar después de la falla de red guarda', async () => {
    onSave.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onSaved = vi.fn()
    render(<AppearanceForm {...props({ onSaved })} />)

    await userEvent.click(guardar())
    await waitFor(() => expect(guardar()).toBeEnabled())
    await userEvent.click(guardar())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  // Permiso perdido: Next ya está navegando, "revisá la conexión" sería falso.
  it('una redirección no se informa como falla', async () => {
    let redireccion: unknown
    try {
      redirect('/unauthorized')
    } catch (error) {
      redireccion = error
    }
    onSave.mockRejectedValue(redireccion)
    render(<AppearanceForm {...props()} />)

    await userEvent.click(guardar())

    await waitFor(() => expect(guardar()).toBeEnabled())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('Cancelar solo aparece si la pantalla lo pide', async () => {
    const onCancel = vi.fn()
    const { rerender } = render(<AppearanceForm {...props()} />)
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()

    rerender(<AppearanceForm {...props({ onCancel })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
