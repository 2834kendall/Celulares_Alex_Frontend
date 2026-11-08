import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateHorasAnularPago } from './updateHorasAnularPago'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockEmpresasResult(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_empresas: result })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('updateHorasAnularPago (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 10, empresa_id: 3 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it.each([0, 721, 1.5, Number.NaN])('rechaza %s horas sin tocar la base', async (horas) => {
    const result = await updateHorasAnularPago(horas)

    expect(result).toEqual({
      ok: false,
      error: 'Indicá un número entero de horas entre 1 y 720.',
    })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('guarda el plazo en la empresa del JWT, con EMPRESAS_WRITE', async () => {
    const client = mockEmpresasResult({ data: [{ org_id: 3 }], error: null })

    const result = await updateHorasAnularPago(72)

    expect(result).toEqual({ ok: true })
    expect(mockRequirePermission).toHaveBeenCalledWith('EMPRESAS_WRITE')
    const builder = vi.mocked(client.from).mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith({ org_horas_anular_pago: 72 })
    expect(builder.eq).toHaveBeenCalledWith('org_id', 3)
  })

  it('si la RLS filtra el UPDATE (0 filas) no finge que se guardó', async () => {
    mockEmpresasResult({ data: [], error: null })

    expect(await updateHorasAnularPago(24)).toEqual({
      ok: false,
      error: 'No se pudo guardar el plazo.',
    })
  })
})
