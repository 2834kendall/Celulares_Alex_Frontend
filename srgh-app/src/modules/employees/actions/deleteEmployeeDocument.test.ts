import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { deleteEmployeeDocument } from './deleteEmployeeDocument'
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

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

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

describe('deleteEmployeeDocument (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un docId inválido SIN tocar permisos', async () => {
    const result = await deleteEmployeeDocument(0)

    expect(result).toEqual({ ok: false, error: 'Documento no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_WRITE', async () => {
    mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_path: '1/empleados/10/x.pdf', doc_empleado_id: 10 }, error: null },
        { data: null, error: null },
      ],
    })
    mockProvider()

    await deleteEmployeeDocument(1)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_WRITE)
  })

  it('rechaza un docId de otra empresa (RLS no devuelve fila) sin tocar el proveedor', async () => {
    mockClient({ sgrh_documentos: { data: null, error: null } })
    const provider = mockProvider()

    const result = await deleteEmployeeDocument(999)

    expect(result).toEqual({ ok: false, error: 'Documento no encontrado.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('si el DELETE de la fila falla, no llama al proveedor', async () => {
    mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_path: '1/empleados/10/x.pdf', doc_empleado_id: 10 }, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })
    const provider = mockProvider()

    const result = await deleteEmployeeDocument(1)

    expect(result).toEqual({ ok: false, error: 'No se pudo eliminar el documento.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('camino feliz: borra la fila PRIMERO y el objeto después', async () => {
    const client = mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_path: '1/empleados/10/x.pdf', doc_empleado_id: 10 }, error: null },
        { data: null, error: null },
      ],
    })
    const provider = mockProvider()

    const result = await deleteEmployeeDocument(1)

    expect(result).toEqual({ ok: true })
    const deleteBuilder = client.from.mock.results[1].value
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(provider.remove).toHaveBeenCalledWith('DOCUMENTOS_EMPLEADO', ['1/empleados/10/x.pdf'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('si falla el borrado best-effort del objeto, no rompe la respuesta', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_path: '1/empleados/10/x.pdf', doc_empleado_id: 10 }, error: null },
        { data: null, error: null },
      ],
    })
    mockProvider({ remove: vi.fn(async () => ({ ok: false as const, error: 'UNKNOWN' as const })) })

    const result = await deleteEmployeeDocument(1)

    expect(result).toEqual({ ok: true })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
