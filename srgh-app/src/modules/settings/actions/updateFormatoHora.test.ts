import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateFormatoHora } from './updateFormatoHora'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { FormatoHora } from '@/lib/time/formatoHora'

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

describe('updateFormatoHora (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 10, empresa_id: 3 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza un formato invalido sin pedir permiso ni tocar la base', async () => {
    const result = await updateFormatoHora('ampm' as FormatoHora)

    expect(result).toEqual({ ok: false, error: 'Formato de hora inválido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('exige EMPRESAS_WRITE: afecta a toda la empresa', async () => {
    mockEmpresasResult({ data: [{ org_id: 3 }], error: null })

    await updateFormatoHora('12h')

    expect(mockRequirePermission).toHaveBeenCalledWith('EMPRESAS_WRITE')
  })

  it('guarda el formato en la empresa del JWT y revalida todo el layout', async () => {
    const client = mockEmpresasResult({ data: [{ org_id: 3 }], error: null })

    const result = await updateFormatoHora('12h')

    expect(result).toEqual({ ok: true })
    const builder = vi.mocked(client.from).mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith({ org_formato_hora: '12h' })
    expect(builder.eq).toHaveBeenCalledWith('org_id', 3)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('si la RLS filtra el UPDATE (0 filas) no finge que se guardo', async () => {
    mockEmpresasResult({ data: [], error: null })

    const result = await updateFormatoHora('24h')

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el formato de hora.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('devuelve error si falla la base', async () => {
    mockEmpresasResult({ data: null, error: { message: 'boom' } })

    const result = await updateFormatoHora('24h')

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el formato de hora.' })
  })
})
