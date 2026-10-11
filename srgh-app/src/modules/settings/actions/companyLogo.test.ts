import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { setCompanyLogo } from './setCompanyLogo'
import { removeCompanyLogo } from './removeCompanyLogo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function mockProvider(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const provider = {
    upload: vi.fn(async () => ({ ok: true as const, data: { path: '1/logo/nuevo.png' } })),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

function formDataWithPng(): FormData {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const formData = new FormData()
  formData.set('file', new File([bytes], 'logo.png', { type: 'image/png' }))
  return formData
}

const EMPRESA_CON_LOGO = { data: { org_id: 1, org_logo_url: '1/logo/viejo.png' }, error: null }
const EMPRESA_SIN_LOGO = { data: { org_id: 1, org_logo_url: null }, error: null }
const UPDATE_OK = { data: null, error: null }

describe('setCompanyLogo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza el FormData sin archivo SIN tocar permisos', async () => {
    const result = await setCompanyLogo(new FormData())

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPRESAS_WRITE', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_SIN_LOGO, UPDATE_OK] })
    mockProvider()

    await setCompanyLogo(formDataWithPng())

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPRESAS_WRITE)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as typeof CLAIMS)

    const result = await setCompanyLogo(formDataWithPng())

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza por magic bytes sin tocar la base ni el proveedor', async () => {
    const formData = new FormData()
    formData.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'logo.png'))
    const provider = mockProvider()

    const result = await setCompanyLogo(formData)

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('si no encuentra la empresa no sube nada', async () => {
    mockClient({ sgrh_empresas: { data: null, error: null } })
    const provider = mockProvider()

    const result = await setCompanyLogo(formDataWithPng())

    expect(result).toEqual({ ok: false, error: 'No se encontró la empresa.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('camino feliz: sube con la ruta de la empresa del JWT, guarda y borra el anterior', async () => {
    const client = mockClient({ sgrh_empresas: [EMPRESA_CON_LOGO, UPDATE_OK] })
    const provider = mockProvider()

    const result = await setCompanyLogo(formDataWithPng())

    expect(result).toEqual({ ok: true })
    const [upload] = provider.upload.mock.calls[0] as unknown as [
      { container: string; path: string },
    ]
    expect(upload.container).toBe('LOGO_EMPRESA')
    expect(upload.path).toMatch(/^1\/logo\/[0-9a-f-]+\.png$/)
    expect(client.from).toHaveBeenCalledWith('sgrh_empresas')
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', ['1/logo/viejo.png'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('sin logo anterior no borra nada', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_SIN_LOGO, UPDATE_OK] })
    const provider = mockProvider()

    await setCompanyLogo(formDataWithPng())

    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('si el upload falla no escribe la referencia', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_SIN_LOGO, UPDATE_OK] })
    mockProvider({
      upload: vi.fn(async () => ({ ok: false as const, error: 'PROVIDER_ERROR' as const })),
    })

    const result = await setCompanyLogo(formDataWithPng())

    expect(result.ok).toBe(false)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('si falla el UPDATE, revierte el objeto recién subido', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_CON_LOGO, { data: null, error: { message: 'x' } }] })
    const provider = mockProvider()

    const result = await setCompanyLogo(formDataWithPng())

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el logo.' })
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', ['1/logo/nuevo.png'])
    expect(provider.remove).not.toHaveBeenCalledWith('LOGO_EMPRESA', ['1/logo/viejo.png'])
  })

  it('si falla el borrado del logo anterior, igual responde ok', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_CON_LOGO, UPDATE_OK] })
    mockProvider({
      remove: vi.fn(async () => ({ ok: false as const, error: 'PROVIDER_ERROR' as const })),
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await setCompanyLogo(formDataWithPng())

    expect(result).toEqual({ ok: true })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('removeCompanyLogo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('exige EMPRESAS_WRITE', async () => {
    mockClient({ sgrh_empresas: EMPRESA_SIN_LOGO })
    mockProvider()

    await removeCompanyLogo()

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPRESAS_WRITE)
  })

  it('si no encuentra la empresa lo dice', async () => {
    mockClient({ sgrh_empresas: { data: null, error: { message: 'x' } } })
    mockProvider()

    expect(await removeCompanyLogo()).toEqual({ ok: false, error: 'No se encontró la empresa.' })
  })

  it('sin logo no hace nada', async () => {
    mockClient({ sgrh_empresas: EMPRESA_SIN_LOGO })
    const provider = mockProvider()

    expect(await removeCompanyLogo()).toEqual({ ok: true })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('suelta la referencia y después borra el objeto', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_CON_LOGO, UPDATE_OK] })
    const provider = mockProvider()

    expect(await removeCompanyLogo()).toEqual({ ok: true })
    expect(provider.remove).toHaveBeenCalledWith('LOGO_EMPRESA', ['1/logo/viejo.png'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('si falla el UPDATE no borra el objeto', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_CON_LOGO, { data: null, error: { message: 'x' } }] })
    const provider = mockProvider()

    expect(await removeCompanyLogo()).toEqual({ ok: false, error: 'No se pudo quitar el logo.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('si falla el borrado del objeto, igual responde ok', async () => {
    mockClient({ sgrh_empresas: [EMPRESA_CON_LOGO, UPDATE_OK] })
    mockProvider({
      remove: vi.fn(async () => ({ ok: false as const, error: 'PROVIDER_ERROR' as const })),
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await removeCompanyLogo()).toEqual({ ok: true })
    consoleError.mockRestore()
  })
})
