import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listLabFiles } from './listLabFiles'
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

const OBJETO = {
  path: '1/_lab/a.jpg',
  sizeBytes: 2048,
  contentType: 'image/jpeg',
  createdAt: '2026-07-31T12:00:00Z',
}

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(async () => ({
      ok: true as const,
      data: { '1/_lab/a.jpg': 'https://cdn/a?token=t' },
    })),
    list: vi.fn(async () => ({ ok: true as const, data: [OBJETO] })),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

describe('listLabFiles (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('exige EMPLEADOS_WRITE', async () => {
    mockProvider()

    await listLabFiles()

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await listLabFiles()

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.list).not.toHaveBeenCalled()
  })

  it('lista el prefijo de la empresa del JWT y firma EN LOTE con TTL_LAB', async () => {
    const provider = mockProvider()

    const result = await listLabFiles()

    expect(result).toEqual({
      ok: true,
      items: [{ ...OBJETO, url: 'https://cdn/a?token=t' }],
    })
    expect(provider.list).toHaveBeenCalledWith('FOTOS_EMPLEADO', '1/_lab')
    expect(provider.getSignedUrls).toHaveBeenCalledTimes(1)
    expect(provider.getSignedUrls).toHaveBeenCalledWith('FOTOS_EMPLEADO', ['1/_lab/a.jpg'], TTL_LAB)
  })

  it('omite objetos cuya firma individual falló (borrado entre list y sign)', async () => {
    mockProvider({
      list: vi.fn(async () => ({
        ok: true as const,
        data: [OBJETO, { ...OBJETO, path: '1/_lab/borrada.png' }],
      })),
    })

    const result = await listLabFiles()

    expect(result).toEqual({ ok: true, items: [{ ...OBJETO, url: 'https://cdn/a?token=t' }] })
  })

  it('traduce el error del list', async () => {
    mockProvider({
      list: vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' as const })),
    })

    const result = await listLabFiles()

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
  })

  it('traduce el error de la firma en lote', async () => {
    mockProvider({
      getSignedUrls: vi.fn(async () => ({ ok: false as const, error: 'UNKNOWN' as const })),
    })

    const result = await listLabFiles()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo completar la operación con el archivo.',
    })
  })
})
