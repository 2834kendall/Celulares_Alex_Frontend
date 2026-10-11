import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SucursalAppearanceForm } from './SucursalAppearanceForm'
import { previewShellColors } from '@/modules/settings/lib/previewShell'
import { updateSucursalApariencia } from '@/modules/settings/actions/updateSucursalApariencia'
import { setSucursalPreview } from '@/modules/settings/actions/setSucursalPreview'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/settings',
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/modules/settings/lib/previewShell', () => ({
  previewShellColors: vi.fn(),
}))

vi.mock('@/modules/settings/actions/updateSucursalApariencia', () => ({
  updateSucursalApariencia: vi.fn(),
}))

vi.mock('@/modules/settings/actions/setSucursalPreview', () => ({
  setSucursalPreview: vi.fn(),
}))

const VIEJO_ACENTO = '#111111'
const VIEJO_SIDEBAR = '#222222'
const NUEVO_ACENTO = '#9f1239'
const NUEVO_SIDEBAR = '#1b2a41'

function props(overrides: Partial<Parameters<typeof SucursalAppearanceForm>[0]> = {}) {
  return {
    sucursalNombre: 'Sucursal 11',
    sucursalId: 11,
    colorAcentoActual: VIEJO_ACENTO,
    colorSidebarActual: VIEJO_SIDEBAR,
    officialColorAcento: VIEJO_ACENTO,
    officialColorSidebar: VIEJO_SIDEBAR,
    ...overrides,
  }
}

/** Ultimo par de colores con el que se repinto el shell. */
function ultimoRepintado() {
  const llamadas = vi.mocked(previewShellColors).mock.calls
  return llamadas[llamadas.length - 1]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateSucursalApariencia).mockResolvedValue({ ok: true })
  vi.mocked(setSucursalPreview).mockResolvedValue({ ok: true })
})

describe('SucursalAppearanceForm — restauracion del tema al salir', () => {
  /*
   * LA regresion de este formulario, reportada tres veces como "cambio los
   * colores, voy a Inicio y salen los viejos; vuelvo a Configuracion y ahi si
   * aparecen".
   *
   * El efecto que restaura el tema al desmontar tiene deps vacias (corre solo
   * al montar/desmontar), asi que su funcion de limpieza capturaba
   * `officialColor*` del PRIMER render. Despues de guardar, `router.refresh()`
   * traia los colores nuevos por props, pero al navegar la limpieza repintaba
   * con la foto vieja que tenia capturada. Al volver a Configuracion el
   * formulario montaba de nuevo con los valores frescos y recien entonces la
   * navegacion se veia bien.
   *
   * Ahora la limpieza lee de una ref que se actualiza en cada render.
   */
  it('al desmontar restaura el tema oficial VIGENTE, no el del primer render', () => {
    const { rerender, unmount } = render(<SucursalAppearanceForm {...props()} />)

    // Lo que hace `router.refresh()` tras guardar: llegan props nuevas sin
    // remontar el componente (el panel no cambio de `key`).
    rerender(
      <SucursalAppearanceForm
        {...props({
          officialColorAcento: NUEVO_ACENTO,
          officialColorSidebar: NUEVO_SIDEBAR,
        })}
      />
    )

    vi.mocked(previewShellColors).mockClear()
    unmount()

    expect(ultimoRepintado()).toEqual([NUEVO_ACENTO, NUEVO_SIDEBAR])
  })

  it('si el tema oficial no cambio, al desmontar restaura ese mismo', () => {
    const { unmount } = render(<SucursalAppearanceForm {...props()} />)

    vi.mocked(previewShellColors).mockClear()
    unmount()

    expect(ultimoRepintado()).toEqual([VIEJO_ACENTO, VIEJO_SIDEBAR])
  })

  it('al montar previsualiza los colores guardados de ESTA sucursal', () => {
    render(
      <SucursalAppearanceForm
        {...props({ colorAcentoActual: NUEVO_ACENTO, colorSidebarActual: NUEVO_SIDEBAR })}
      />
    )

    expect(previewShellColors).toHaveBeenCalledWith(NUEVO_ACENTO, NUEVO_SIDEBAR)
  })
})

describe('SucursalAppearanceForm — guardado', () => {
  /*
   * Guardar deja la vista puesta en la sucursal recien editada. Sin esto, el
   * shell volvia al tema de la sucursal propia apenas se salia de
   * Configuracion, que es la otra mitad del sintoma de "se perdieron los
   * colores": se guardaban bien, pero se estaba viendo otra sucursal.
   */
  it('mueve la vista previa a la sucursal editada', async () => {
    const user = userEvent.setup()
    render(<SucursalAppearanceForm {...props()} />)

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(setSucursalPreview).toHaveBeenCalledWith(11)
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('un usuario con sucursal fija (sin sucursalId) no toca la vista previa', async () => {
    const user = userEvent.setup()
    render(<SucursalAppearanceForm {...props({ sucursalId: undefined })} />)

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(updateSucursalApariencia).toHaveBeenCalled()
    })
    expect(setSucursalPreview).not.toHaveBeenCalled()
  })
})
