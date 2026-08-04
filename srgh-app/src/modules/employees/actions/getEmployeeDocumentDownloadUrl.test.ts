import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmployeeDocumentDownloadUrl } from './getEmployeeDocumentDownloadUrl'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_DESCARGA } from '@/lib/storage/containers'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(async () => ({ ok: true as const, data: 'https://signed.example/doc' })),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

describe('getEmployeeDocumentDownloadUrl (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza un docId inválido SIN tocar permisos', async () => {
    const result = await getEmployeeDocumentDownloadUrl(0)

    expect(result).toEqual({ ok: false, error: 'Documento no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_READ', async () => {
    mockClient({
      sgrh_documentos: {
        data: { doc_path: '1/empleados/10/x.pdf', doc_nombre: 'Contrato' },
        error: null,
      },
    })
    mockProvider()

    await getEmployeeDocumentDownloadUrl(1)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_READ)
  })

  it('falla si el JWT no trae empresa_id, sin crear el cliente', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await getEmployeeDocumentDownloadUrl(1)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza un docId de otra empresa (RLS no devuelve fila)', async () => {
    mockClient({ sgrh_documentos: { data: null, error: null } })
    const provider = mockProvider()

    const result = await getEmployeeDocumentDownloadUrl(999)

    expect(result).toEqual({ ok: false, error: 'Documento no encontrado.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('rechaza un path que no pertenece a la empresa del JWT (FORBIDDEN)', async () => {
    mockClient({
      sgrh_documentos: {
        data: { doc_path: '2/empleados/10/x.pdf', doc_nombre: 'Contrato' },
        error: null,
      },
    })
    const provider = mockProvider()

    const result = await getEmployeeDocumentDownloadUrl(1)

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
    expect(provider.getSignedUrl).not.toHaveBeenCalled()
  })

  it('si la firma falla, propaga el error mapeado', async () => {
    mockClient({
      sgrh_documentos: {
        data: { doc_path: '1/empleados/10/x.pdf', doc_nombre: 'Contrato' },
        error: null,
      },
    })
    mockProvider({
      getSignedUrl: vi.fn(async () => ({ ok: false as const, error: 'NOT_FOUND' as const })),
    })

    const result = await getEmployeeDocumentDownloadUrl(1)

    expect(result).toEqual({ ok: false, error: 'El archivo no existe o ya fue eliminado.' })
  })

  it('camino feliz: firma con downloadAs sanitizado y la extensión del path', async () => {
    mockClient({
      sgrh_documentos: {
        data: { doc_path: '1/empleados/10/x.pdf', doc_nombre: 'Contrato firmado 2026' },
        error: null,
      },
    })
    const provider = mockProvider()

    const result = await getEmployeeDocumentDownloadUrl(1)

    expect(result).toEqual({ ok: true, url: 'https://signed.example/doc' })
    expect(provider.getSignedUrl).toHaveBeenCalledWith(
      'DOCUMENTOS_EMPLEADO',
      '1/empleados/10/x.pdf',
      TTL_DESCARGA,
      { downloadAs: 'Contrato firmado 2026.pdf' }
    )
  })

  it('no duplica la extensión si el nombre ya la trae', async () => {
    mockClient({
      sgrh_documentos: {
        data: { doc_path: '1/empleados/10/x.pdf', doc_nombre: 'contrato.pdf' },
        error: null,
      },
    })
    const provider = mockProvider()

    await getEmployeeDocumentDownloadUrl(1)

    expect(provider.getSignedUrl).toHaveBeenCalledWith(
      'DOCUMENTOS_EMPLEADO',
      '1/empleados/10/x.pdf',
      TTL_DESCARGA,
      { downloadAs: 'contrato.pdf' }
    )
  })
})
