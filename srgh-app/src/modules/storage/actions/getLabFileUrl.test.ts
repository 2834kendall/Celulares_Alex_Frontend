import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLabFileUrl } from './getLabFileUrl'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_LAB } from '@/lib/storage/containers'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))

const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(async () => ({ ok: true as const, data: 'https://cdn/a?token=t' })),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

describe('getLabFileUrl (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza un path vacío sin tocar permisos', async () => {
    const result = await getLabFileUrl('   ')

    expect(result).toEqual({ ok: false, error: 'Archivo inválido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPLEADOS_WRITE', async () => {
    mockProvider()

    await getLabFileUrl('1/_lab/a.jpg')

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await getLabFileUrl('1/_lab/a.jpg')

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('rechaza un path de OTRA empresa sin tocar el proveedor (cross-tenant)', async () => {
    const provider = mockProvider()

    const result = await getLabFileUrl('2/_lab/ajena.jpg')

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('rechaza traversal aunque el prefijo aparente ser propio', async () => {
    const provider = mockProvider()

    const result = await getLabFileUrl('1/../2/ajena.jpg')

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('firma con TTL_LAB y devuelve la URL', async () => {
    const provider = mockProvider()

    const result = await getLabFileUrl('1/_lab/a.jpg')

    expect(result).toEqual({ ok: true, url: 'https://cdn/a?token=t' })
    expect(provider.getSignedUrl).toHaveBeenCalledWith('FOTOS_EMPLEADO', '1/_lab/a.jpg', TTL_LAB)
  })

  it('traduce el error del proveedor', async () => {
    mockProvider({
      getSignedUrl: vi.fn(async () => ({ ok: false as const, error: 'NOT_FOUND' as const })),
    })

    const result = await getLabFileUrl('1/_lab/a.jpg')

    expect(result).toEqual({ ok: false, error: 'El archivo no existe o ya fue eliminado.' })
  })
})
