import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { setEmployeePhoto } from './setEmployeePhoto'
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
    upload: vi.fn(async () => ({ ok: true as const, data: { path: '1/empleados/10/x.jpg' } })),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

function formDataWithJpeg(): FormData {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
  const formData = new FormData()
  formData.set('file', new File([bytes], 'foto.jpg', { type: 'image/jpeg' }))
  return formData
}

describe('setEmployeePhoto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza el FormData sin archivo SIN tocar permisos', async () => {
    const result = await setEmployeePhoto(10, new FormData())

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un empId inválido', async () => {
    const result = await setEmployeePhoto(0, formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPLEADOS_WRITE', async () => {
    mockClient({ sgrh_empleados: { data: { emp_id: 10, emp_foto_path: null }, error: null } })
    mockProvider()

    await setEmployeePhoto(10, formDataWithJpeg())

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id, sin crear el cliente', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await setEmployeePhoto(10, formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza un empId de otra empresa (RLS no devuelve fila) sin tocar el proveedor', async () => {
    mockClient({ sgrh_empleados: { data: null, error: null } })
    const provider = mockProvider()

    const result = await setEmployeePhoto(999, formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('rechaza por magic bytes sin tocar el proveedor ni la DB de escritura', async () => {
    mockClient({ sgrh_empleados: { data: { emp_id: 10, emp_foto_path: null }, error: null } })
    const provider = mockProvider()

    const formData = new FormData()
    const texto = new TextEncoder().encode('no es una imagen')
    formData.set('file', new File([texto], 'falso.jpg', { type: 'image/jpeg' }))

    const result = await setEmployeePhoto(10, formData)

    expect(result).toEqual({ ok: false, error: 'El tipo de archivo no está permitido.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('camino feliz: sube, guarda la referencia y borra la foto anterior', async () => {
    const client = mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_foto_path: '1/empleados/10/vieja.jpg' }, error: null },
        { data: null, error: null },
      ],
    })
    const provider = mockProvider()

    const result = await setEmployeePhoto(10, formDataWithJpeg())

    expect(result).toEqual({ ok: true, path: '1/empleados/10/x.jpg' })
    expect(provider.upload).toHaveBeenCalledWith({
      container: 'FOTOS_EMPLEADO',
      path: expect.stringMatching(/^1\/empleados\/10\/[0-9a-f-]{36}\.jpg$/),
      body: expect.any(Uint8Array),
      contentType: 'image/jpeg',
    })
    const updateBuilder = client.from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ emp_foto_path: '1/empleados/10/x.jpg' })
    expect(provider.remove).toHaveBeenCalledWith('FOTOS_EMPLEADO', ['1/empleados/10/vieja.jpg'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('sin foto anterior no llama a remove', async () => {
    mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_foto_path: null }, error: null },
        { data: null, error: null },
      ],
    })
    const provider = mockProvider()

    await setEmployeePhoto(10, formDataWithJpeg())

    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('si el upload falla, no toca la DB de escritura', async () => {
    mockClient({ sgrh_empleados: { data: { emp_id: 10, emp_foto_path: null }, error: null } })
    const provider = mockProvider({
      upload: vi.fn(async () => ({ ok: false as const, error: 'TOO_LARGE' as const })),
    })

    const result = await setEmployeePhoto(10, formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'El archivo supera el tamaño máximo permitido.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('si falla el UPDATE, revierte el objeto recién subido (rollback)', async () => {
    mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_foto_path: null }, error: null },
        { data: null, error: { code: '42501', message: 'insufficient_privilege' } },
      ],
    })
    const provider = mockProvider()

    const result = await setEmployeePhoto(10, formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la foto del empleado.' })
    expect(provider.remove).toHaveBeenCalledWith('FOTOS_EMPLEADO', ['1/empleados/10/x.jpg'])
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('si falla el borrado best-effort de la foto anterior, no rompe la respuesta', async () => {
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

    const result = await setEmployeePhoto(10, formDataWithJpeg())

    expect(result).toEqual({ ok: true, path: '1/empleados/10/x.jpg' })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
