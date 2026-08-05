import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { removeEmployeePhoto } from './removeEmployeePhoto'
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

describe('removeEmployeePhoto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza un empId inválido sin tocar permisos', async () => {
    const result = await removeEmployeePhoto(0)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPLEADOS_WRITE', async () => {
    mockClient({ sgrh_empleados: { data: { emp_id: 10, emp_foto_path: null }, error: null } })
    mockProvider()

    await removeEmployeePhoto(10)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id, sin crear el cliente', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await removeEmployeePhoto(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza un empId de otra empresa (RLS no devuelve fila)', async () => {
    mockClient({ sgrh_empleados: { data: null, error: null } })
    const provider = mockProvider()

    const result = await removeEmployeePhoto(999)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('sin foto es idempotente: ok sin tocar update ni el proveedor', async () => {
    const client = mockClient({
      sgrh_empleados: { data: { emp_id: 10, emp_foto_path: null }, error: null },
    })
    const provider = mockProvider()

    const result = await removeEmployeePhoto(10)

    expect(result).toEqual({ ok: true })
    expect(provider.remove).not.toHaveBeenCalled()
    // Un solo from('sgrh_empleados'): el de lectura. No hubo UPDATE.
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('camino feliz: limpia la referencia primero y borra el objeto best-effort', async () => {
    const client = mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_foto_path: '1/empleados/10/vieja.jpg' }, error: null },
        { data: null, error: null },
      ],
    })
    const provider = mockProvider()

    const result = await removeEmployeePhoto(10)

    expect(result).toEqual({ ok: true })
    const updateBuilder = client.from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ emp_foto_path: null })
    expect(provider.remove).toHaveBeenCalledWith('FOTOS_EMPLEADO', ['1/empleados/10/vieja.jpg'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('si falla el UPDATE, no llama al proveedor', async () => {
    mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_foto_path: '1/empleados/10/vieja.jpg' }, error: null },
        { data: null, error: { code: '42501', message: 'insufficient_privilege' } },
      ],
    })
    const provider = mockProvider()

    const result = await removeEmployeePhoto(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo quitar la foto del empleado.' })
    expect(provider.remove).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('si falla el borrado best-effort del objeto, igual responde ok (huérfano inofensivo)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_foto_path: '1/empleados/10/vieja.jpg' }, error: null },
        { data: null, error: null },
      ],
    })
    mockProvider({
      remove: vi.fn(async () => ({ ok: false as const, error: 'UNKNOWN' as const })),
    })

    const result = await removeEmployeePhoto(10)

    expect(result).toEqual({ ok: true })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
