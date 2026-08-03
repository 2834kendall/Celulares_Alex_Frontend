import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLabDocumentDownloadUrl } from './getLabDocumentDownloadUrl'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_DESCARGA } from '@/lib/storage/containers'
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
    getSignedUrl: vi.fn(async () => ({
      ok: true as const,
      data: 'https://cdn/doc?token=t&download=x',
    })),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

describe('getLabDocumentDownloadUrl (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza un path vacío sin tocar permisos', async () => {
    const result = await getLabDocumentDownloadUrl('  ', 'x.pdf')

    expect(result).toEqual({ ok: false, error: 'Archivo inválido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_READ', async () => {
    mockProvider()

    await getLabDocumentDownloadUrl('1/_lab/a.pdf', 'contrato.pdf')

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_READ)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await getLabDocumentDownloadUrl('1/_lab/a.pdf', 'contrato.pdf')

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('rechaza un path de OTRA empresa sin tocar el proveedor (cross-tenant)', async () => {
    const provider = mockProvider()

    const result = await getLabDocumentDownloadUrl('2/_lab/ajeno.pdf', 'contrato.pdf')

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('firma con TTL_DESCARGA y downloadAs (descarga forzada)', async () => {
    const provider = mockProvider()

    const result = await getLabDocumentDownloadUrl('1/_lab/a.pdf', 'contrato firmado.pdf')

    expect(result).toEqual({ ok: true, url: 'https://cdn/doc?token=t&download=x' })
    expect(provider.getSignedUrl).toHaveBeenCalledWith(
      'DOCUMENTOS_EMPLEADO',
      '1/_lab/a.pdf',
      TTL_DESCARGA,
      {
        downloadAs: 'contrato firmado.pdf',
      }
    )
  })

  it('sanitiza server-side un fileName hostil antes de mandarlo al proveedor', async () => {
    const provider = mockProvider()

    await getLabDocumentDownloadUrl('1/_lab/a.pdf', '../../etc/passwd.pdf')

    expect(provider.getSignedUrl).toHaveBeenCalledWith(
      'DOCUMENTOS_EMPLEADO',
      '1/_lab/a.pdf',
      TTL_DESCARGA,
      { downloadAs: 'etc passwd.pdf' }
    )
  })

  it('un fileName vacío o no-string cae al fallback "documento"', async () => {
    const provider = mockProvider()

    await getLabDocumentDownloadUrl('1/_lab/a.pdf', '')

    expect(provider.getSignedUrl).toHaveBeenCalledWith(
      'DOCUMENTOS_EMPLEADO',
      '1/_lab/a.pdf',
      TTL_DESCARGA,
      { downloadAs: 'documento' }
    )
  })

  it('traduce el error del proveedor', async () => {
    mockProvider({
      getSignedUrl: vi.fn(async () => ({ ok: false as const, error: 'NOT_FOUND' as const })),
    })

    const result = await getLabDocumentDownloadUrl('1/_lab/a.pdf', 'x.pdf')

    expect(result).toEqual({ ok: false, error: 'El archivo no existe o ya fue eliminado.' })
  })
})
