import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { setContextoMarca } from './setContextoMarca'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { getSelectorMarca } from '@/lib/empresa/contexto-activo'
import { MARCA_CONTEXTO_COOKIE } from '@/lib/empresa/marca-contexto-cookie'
import { PERMISOS_DATOS_POR_MARCA } from '@/lib/permissions/zones'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))
vi.mock('@/lib/empresa/contexto-activo', () => ({ getSelectorMarca: vi.fn() }))

const store = { set: vi.fn(), delete: vi.fn() }
const MARCA = { id: 3, nombre: 'Infinity', colorAcento: null, colorSidebar: null, logoPath: null }

function claims(usrId?: number) {
  vi.mocked(requireAnyPermission).mockResolvedValue({
    app_metadata: { usr_id: usrId },
  } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>)
  claims(7)
  vi.mocked(getSelectorMarca).mockResolvedValue({ marcas: [MARCA], marcaElegida: null })
})

describe('setContextoMarca', () => {
  it('rechaza un id inválido sin pedir permiso', async () => {
    expect(await setContextoMarca(0)).toEqual({ ok: false, error: 'Marca inválida.' })
    expect(await setContextoMarca(1.5)).toEqual({ ok: false, error: 'Marca inválida.' })
    expect(requireAnyPermission).not.toHaveBeenCalled()
  })

  it('exige un permiso de datos, no un rol', async () => {
    await setContextoMarca(3)
    expect(requireAnyPermission).toHaveBeenCalledWith(PERMISOS_DATOS_POR_MARCA)
  })

  it('con null vuelve a "Todas" sin consultar las marcas', async () => {
    expect(await setContextoMarca(null)).toEqual({ ok: true })
    expect(store.delete).toHaveBeenCalledWith(MARCA_CONTEXTO_COOKIE)
    expect(getSelectorMarca).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('no guarda una marca que esta cuenta no puede elegir', async () => {
    const result = await setContextoMarca(99)
    expect(result).toEqual({ ok: false, error: 'No podés filtrar por esa marca.' })
    expect(store.set).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sin selector no se puede elegir ninguna', async () => {
    vi.mocked(getSelectorMarca).mockResolvedValue({ marcas: [], marcaElegida: null })
    expect((await setContextoMarca(3)).ok).toBe(false)
    expect(store.set).not.toHaveBeenCalled()
  })

  it('sin usuario en el JWT no guarda: la cookie no sabría de quién es', async () => {
    claims(undefined)
    expect((await setContextoMarca(3)).ok).toBe(false)
    expect(store.set).not.toHaveBeenCalled()
  })

  it('guarda la marca y su usuario en una cookie httpOnly, y revalida', async () => {
    expect(await setContextoMarca(3)).toEqual({ ok: true })
    expect(store.set).toHaveBeenCalledWith(
      MARCA_CONTEXTO_COOKIE,
      JSON.stringify({ u: 7, m: 3 }),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
