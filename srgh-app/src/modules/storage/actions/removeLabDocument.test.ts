import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { removeLabDocument } from './removeLabDocument'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

describe('removeLabDocument (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza un path vacío sin tocar permisos', async () => {
    const result = await removeLabDocument('')

    expect(result).toEqual({ ok: false, error: 'Archivo inválido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_WRITE', async () => {
    mockProvider()

    await removeLabDocument('1/_lab/a.pdf')

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await removeLabDocument('1/_lab/a.pdf')

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('rechaza un path de OTRA empresa sin tocar el proveedor (cross-tenant)', async () => {
    const provider = mockProvider()

    const result = await removeLabDocument('2/_lab/ajeno.pdf')

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('borra y revalida la página del lab', async () => {
    const provider = mockProvider()

    const result = await removeLabDocument('1/_lab/a.pdf')

    expect(result).toEqual({ ok: true })
    expect(provider.remove).toHaveBeenCalledWith('DOCUMENTOS_EMPLEADO', ['1/_lab/a.pdf'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/storage-lab')
  })

  it('traduce el error del proveedor y no revalida', async () => {
    mockProvider({
      remove: vi.fn(async () => ({ ok: false as const, error: 'UNKNOWN' as const })),
    })

    const result = await removeLabDocument('1/_lab/a.pdf')

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo completar la operación con el archivo.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
