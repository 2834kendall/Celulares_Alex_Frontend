import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { deleteFaceEnrollment } from './deleteFaceEnrollment'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

function mockBiometria(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_biometria_empleado: result })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('deleteFaceEnrollment (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza un id inválido sin tocar permisos ni la base', async () => {
    const result = await deleteFaceEnrollment(-3)

    expect(result).toEqual({ ok: false, error: 'Empleado inválido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('pide BIOMETRIA_WRITE', async () => {
    mockBiometria({ data: [{ bio_id: 7 }], error: null })

    await deleteFaceEnrollment(10)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.BIOMETRIA_WRITE)
  })

  it('falla si el JWT no trae empresa', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await deleteFaceEnrollment(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('borra el vector del empleado en la empresa del JWT y refresca su perfil', async () => {
    const client = mockBiometria({ data: [{ bio_id: 7 }], error: null })

    const result = await deleteFaceEnrollment(10)

    expect(result).toEqual({ ok: true })
    const query = client.from.mock.results[0].value
    expect(query.delete).toHaveBeenCalled()
    expect(query.eq).toHaveBeenCalledWith('bio_empleado_id', 10)
    expect(query.eq).toHaveBeenCalledWith('bio_empresa_id', 1)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  // Un DELETE que la RLS filtra no da error: afecta 0 filas. Sin este chequeo
  // la pantalla diría "eliminado" con el vector intacto.
  it('si no borró ninguna fila, lo informa como error', async () => {
    mockBiometria({ data: [], error: null })

    const result = await deleteFaceEnrollment(10)

    expect(result).toEqual({
      ok: false,
      error: 'No se encontró un registro facial de este empleado que pueda eliminar.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('devuelve un error genérico si el borrado falla', async () => {
    mockBiometria({ data: null, error: { message: 'boom' } })

    const result = await deleteFaceEnrollment(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo eliminar el registro facial.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
