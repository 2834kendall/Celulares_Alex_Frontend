import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteBrand,
  getBrandSettings,
  removeBrandLogo,
  saveBrand,
  saveBrandApariencia,
  setBrandLogo,
} from './actions'
import { branchAdmin } from '../branches/access'
import { getStorageProvider } from '@/lib/storage'
import type { StorageProvider } from '@/lib/storage/types'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('../branches/access', () => ({ branchAdmin: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const provider = {
  getSignedUrl: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}

function setup(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0] = {},
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(responses, options)
  vi.mocked(branchAdmin).mockResolvedValue({
    admin,
    empresa: 1,
    actor: 'actor',
    claims: { sub: 'actor', app_metadata: { permisos: ['EMPRESAS_WRITE'] } },
  } as unknown as Awaited<ReturnType<typeof branchAdmin>>)
  return admin
}

/** PNG mínimo: los magic bytes son lo que valida validateUpload. */
function pngForm() {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const form = new FormData()
  form.set('file', new File([bytes], 'logo.png', { type: 'image/png' }))
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStorageProvider).mockReturnValue(provider as unknown as StorageProvider)
  provider.getSignedUrl.mockResolvedValue({ ok: true, data: 'https://firmada' })
  provider.upload.mockImplementation(async ({ path }: { path: string }) => ({
    ok: true,
    data: { path },
  }))
  provider.remove.mockResolvedValue({ ok: true, data: undefined })
})

describe('getBrandSettings', () => {
  it('agrupa las sucursales por marca y firma solo los logos que existen', async () => {
    setup({
      sgrh_marcas_comerciales: {
        data: [
          { mco_id: 1, mco_nombre: 'Celulares Alex', mco_logo_path: '1/marcas/1/a.png' },
          { mco_id: 2, mco_nombre: 'Infinity', mco_logo_path: null },
        ],
        error: null,
      },
      sgrh_sucursales: {
        data: [
          { suc_id: 10, suc_nombre: 'Mall', suc_activa: true, suc_marca_id: 1 },
          { suc_id: 20, suc_nombre: 'Centro', suc_activa: false, suc_marca_id: 2 },
        ],
        error: null,
      },
    })
    const r = await getBrandSettings()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.brands[0]).toMatchObject({
      mco_id: 1,
      logoUrl: 'https://firmada',
      sucursales: [{ suc_id: 10, suc_nombre: 'Mall', suc_activa: true }],
    })
    expect(r.data.brands[1]).toMatchObject({ mco_id: 2, logoUrl: null })
    expect(provider.getSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('filtra por la empresa del JWT', async () => {
    const admin = setup({
      sgrh_marcas_comerciales: { data: [], error: null },
      sgrh_sucursales: { data: [], error: null },
    })
    await getBrandSettings()
    const marcas = admin.from.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }
    expect(marcas.eq).toHaveBeenCalledWith('mco_empresa_id', 1)
  })

  it('devuelve un error si falla la lectura', async () => {
    setup({
      sgrh_marcas_comerciales: { data: null, error: { message: 'relation does not exist' } },
      sgrh_sucursales: { data: [], error: null },
    })
    expect((await getBrandSettings()).ok).toBe(false)
  })
})

describe('deleteBrand', () => {
  it('rechaza un id inválido sin pedir acceso', async () => {
    expect((await deleteBrand(-1)).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })

  it('toma empresa y actor de la autorización, no del input', async () => {
    const admin = setup({}, { rpcResponses: { sgrh_delete_brand: { data: null, error: null } } })
    expect(await deleteBrand(5)).toEqual({ ok: true })
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_delete_brand', {
      p_actor: 'actor',
      p_empresa: 1,
      p_id: 5,
    })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('borra del bucket el logo que devuelve la RPC', async () => {
    setup({}, { rpcResponses: { sgrh_delete_brand: { data: '1/marcas/5/a.png', error: null } } })
    expect(await deleteBrand(5)).toEqual({ ok: true })
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', ['1/marcas/5/a.png'])
  })

  it('si no se puede borrar el logo, la marca igual queda eliminada', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setup({}, { rpcResponses: { sgrh_delete_brand: { data: '1/marcas/5/a.png', error: null } } })
    provider.remove.mockResolvedValue({ ok: false, error: 'STORAGE_ERROR' })
    expect(await deleteBrand(5)).toEqual({ ok: true })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('muestra el mensaje de la RPC cuando tiene sucursales, y no toca el bucket', async () => {
    const message = 'No se puede eliminar una marca con sucursales. Si ya no se usa, desactivala.'
    setup(
      {},
      { rpcResponses: { sgrh_delete_brand: { data: null, error: { code: '23514', message } } } }
    )
    expect(await deleteBrand(5)).toEqual({ ok: false, error: message })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('no filtra el detalle de un error inesperado', async () => {
    setup(
      {},
      {
        rpcResponses: {
          sgrh_delete_brand: { data: null, error: { code: '23503', message: 'fkey violated' } },
        },
      }
    )
    expect(await deleteBrand(5)).toEqual({ ok: false, error: 'No se pudo eliminar la marca.' })
  })
})

describe('saveBrand', () => {
  it('rechaza un nombre inválido sin pedir acceso', async () => {
    const r = await saveBrand(null, { mco_nombre: 'X', mco_activa: true })
    expect(r).toEqual({ ok: false, error: 'Escribí el nombre de la marca.' })
    expect(branchAdmin).not.toHaveBeenCalled()
  })

  it('rechaza un id inválido sin pedir acceso', async () => {
    expect((await saveBrand(-1, { mco_nombre: 'Infinity', mco_activa: true })).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })

  it('toma empresa y actor de la autorización, no del input', async () => {
    const admin = setup({}, { rpcResponses: { sgrh_save_brand: { data: 5, error: null } } })
    const r = await saveBrand(null, { mco_nombre: '  Infinity ', mco_activa: true })
    expect(r).toEqual({ ok: true, data: 5 })
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_save_brand', {
      p_actor: 'actor',
      p_empresa: 1,
      p_id: null,
      p_data: { mco_nombre: 'Infinity', mco_activa: true },
    })
  })

  it('muestra el mensaje de la RPC para validaciones y permisos', async () => {
    setup(
      {},
      {
        rpcResponses: {
          sgrh_save_brand: {
            data: null,
            error: { code: '23514', message: 'Ya existe una marca con ese nombre.' },
          },
        },
      }
    )
    const r = await saveBrand(null, { mco_nombre: 'Infinity', mco_activa: true })
    expect(r).toEqual({ ok: false, error: 'Ya existe una marca con ese nombre.' })
  })

  it('oculta los errores internos tras un mensaje genérico', async () => {
    setup(
      {},
      {
        rpcResponses: {
          sgrh_save_brand: { data: null, error: { code: 'XX000', message: 'detalle interno' } },
        },
      }
    )
    const r = await saveBrand(null, { mco_nombre: 'Infinity', mco_activa: true })
    expect(r).toEqual({ ok: false, error: 'No se pudo guardar la marca.' })
  })
})

describe('saveBrandApariencia', () => {
  it('rechaza un hex inválido sin pedir acceso', async () => {
    const r = await saveBrandApariencia(1, { colorAcento: 'rojo', colorSidebar: null })
    expect(r.ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })

  it('manda solo las claves de color, para no pisar nombre ni estado', async () => {
    const admin = setup({}, { rpcResponses: { sgrh_save_brand: { data: 1, error: null } } })
    const r = await saveBrandApariencia(1, { colorAcento: '#0891b2', colorSidebar: null })
    expect(r).toEqual({ ok: true })
    const args = (admin.rpc.mock.calls[0] as unknown[])[1] as { p_data: object }
    expect(args.p_data).toEqual({ mco_color_acento: '#0891b2', mco_color_sidebar: null })
  })

  it('mapea el error de la RPC', async () => {
    setup(
      {},
      {
        rpcResponses: {
          sgrh_save_brand: {
            data: null,
            error: { code: '42501', message: 'Marca no encontrada.' },
          },
        },
      }
    )
    const r = await saveBrandApariencia(1, { colorAcento: null, colorSidebar: null })
    expect(r).toEqual({ ok: false, error: 'Marca no encontrada.' })
  })
})

describe('setBrandLogo', () => {
  it('rechaza un formulario sin archivo sin pedir acceso', async () => {
    expect((await setBrandLogo(1, new FormData())).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })

  it('rechaza un archivo que no es imagen por sus bytes', async () => {
    setup()
    const form = new FormData()
    form.set('file', new File(['<svg/>'], 'logo.png', { type: 'image/png' }))
    expect((await setBrandLogo(1, form)).ok).toBe(false)
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('no sube nada si la marca no es de la empresa', async () => {
    setup({ sgrh_marcas_comerciales: { data: null, error: null } })
    const r = await setBrandLogo(9, pngForm())
    expect(r).toEqual({ ok: false, error: 'No se encontró la marca.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('sube bajo la carpeta de la empresa del JWT y borra el logo anterior', async () => {
    const admin = setup(
      { sgrh_marcas_comerciales: { data: { mco_logo_path: '1/marcas/3/viejo.png' }, error: null } },
      { rpcResponses: { sgrh_save_brand: { data: 3, error: null } } }
    )
    const r = await setBrandLogo(3, pngForm())
    expect(r).toEqual({ ok: true })
    const path = (provider.upload.mock.calls[0][0] as { path: string }).path
    expect(path).toMatch(/^1\/marcas\/3\/[0-9a-f-]+\.png$/)
    expect(admin.rpc).toHaveBeenCalledWith(
      'sgrh_save_brand',
      expect.objectContaining({ p_id: 3, p_data: { mco_logo_path: path } })
    )
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', ['1/marcas/3/viejo.png'])
  })

  it('revierte la subida si no se pudo guardar la ruta', async () => {
    setup(
      { sgrh_marcas_comerciales: { data: { mco_logo_path: null }, error: null } },
      {
        rpcResponses: {
          sgrh_save_brand: { data: null, error: { code: '42501', message: 'Ruta' } },
        },
      }
    )
    const r = await setBrandLogo(3, pngForm())
    expect(r).toEqual({ ok: false, error: 'No se pudo guardar el logo.' })
    const path = (provider.upload.mock.calls[0][0] as { path: string }).path
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', [path])
  })
})

describe('removeBrandLogo', () => {
  it('sin logo no hace nada', async () => {
    const admin = setup({ sgrh_marcas_comerciales: { data: { mco_logo_path: null }, error: null } })
    expect(await removeBrandLogo(3)).toEqual({ ok: true })
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('suelta la referencia y después borra el objeto', async () => {
    const admin = setup(
      { sgrh_marcas_comerciales: { data: { mco_logo_path: '1/marcas/3/a.png' }, error: null } },
      { rpcResponses: { sgrh_save_brand: { data: 3, error: null } } }
    )
    expect(await removeBrandLogo(3)).toEqual({ ok: true })
    expect(admin.rpc).toHaveBeenCalledWith(
      'sgrh_save_brand',
      expect.objectContaining({ p_data: { mco_logo_path: null } })
    )
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', ['1/marcas/3/a.png'])
  })

  it('si no pudo soltar la referencia, no borra el objeto', async () => {
    setup(
      { sgrh_marcas_comerciales: { data: { mco_logo_path: '1/marcas/3/a.png' }, error: null } },
      { rpcResponses: { sgrh_save_brand: { data: null, error: { code: 'XX000', message: 'x' } } } }
    )
    expect((await removeBrandLogo(3)).ok).toBe(false)
    expect(provider.remove).not.toHaveBeenCalled()
  })
})
