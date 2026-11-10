import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFaceStatus } from './getFaceStatus'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockBiometria(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_biometria_empleado: result })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('getFaceStatus (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza un id inválido sin tocar permisos ni la base', async () => {
    const result = await getFaceStatus(0)

    expect(result).toEqual({ ok: false, error: 'Empleado inválido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('pide BIOMETRIA_WRITE', async () => {
    mockBiometria({ data: null, error: null })

    await getFaceStatus(10)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.BIOMETRIA_WRITE)
  })

  it('falla si el JWT no trae empresa', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await getFaceStatus(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('sin fila, el empleado no está registrado', async () => {
    mockBiometria({ data: null, error: null })

    const result = await getFaceStatus(10)

    expect(result).toEqual({ ok: true, status: { enrolled: false } })
  })

  it('con un vector del modelo vigente, está registrado y al día', async () => {
    const client = mockBiometria({
      data: { bio_modelo: FACE_MODEL_ID, bio_updated_at: '2026-11-01T15:00:00' },
      error: null,
    })

    const result = await getFaceStatus(10)

    expect(result).toEqual({
      ok: true,
      status: { enrolled: true, updatedAt: '2026-11-01T15:00:00', currentModel: true },
    })
    // Filtra por empleado Y por la empresa del JWT, nunca por un dato del cliente.
    const query = client.from.mock.results[0].value
    expect(query.eq).toHaveBeenCalledWith('bio_empleado_id', 10)
    expect(query.eq).toHaveBeenCalledWith('bio_empresa_id', 1)
  })

  it('con un vector de otro modelo, avisa que hay que capturar de nuevo', async () => {
    mockBiometria({
      data: { bio_modelo: 'modelo-anterior', bio_updated_at: '2026-01-01T10:00:00' },
      error: null,
    })

    const result = await getFaceStatus(10)

    expect(result).toEqual({
      ok: true,
      status: { enrolled: true, updatedAt: '2026-01-01T10:00:00', currentModel: false },
    })
  })

  it('devuelve un error genérico si la consulta falla', async () => {
    mockBiometria({ data: null, error: { message: 'boom' } })

    const result = await getFaceStatus(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el registro facial.' })
  })
})
