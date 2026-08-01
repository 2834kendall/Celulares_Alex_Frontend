import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listLabDocuments } from './listLabDocuments'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))

const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const OBJETO = {
  path: '1/_lab/a.pdf',
  sizeBytes: 4096,
  contentType: 'application/pdf',
  createdAt: '2026-07-31T12:00:00Z',
}

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(async () => ({ ok: true as const, data: [OBJETO] })),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

describe('listLabDocuments (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('exige DOCUMENTOS_READ', async () => {
    mockProvider()

    await listLabDocuments()

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_READ)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await listLabDocuments()

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.list).not.toHaveBeenCalled()
  })

  it('lista el prefijo de la empresa SIN firmar URLs (los documentos no van inline)', async () => {
    const provider = mockProvider()

    const result = await listLabDocuments()

    expect(result).toEqual({ ok: true, items: [OBJETO] })
    expect(provider.list).toHaveBeenCalledWith('DOCUMENTOS_EMPLEADO', '1/_lab')
    expect(provider.getSignedUrls).not.toHaveBeenCalled()
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('traduce el error del proveedor', async () => {
    mockProvider({
      list: vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' as const })),
    })

    const result = await listLabDocuments()

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
  })
})
