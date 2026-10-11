import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { revertContractTermination } from './revertContractTermination'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

function mockRpc(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({}, { rpcResponses: { revertir_terminacion: result } })
  mockCreateClient.mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequirePermission.mockResolvedValue({} as never)
})

describe('revertContractTermination', () => {
  it('rechaza un id inválido sin tocar permisos ni base', async () => {
    const result = await revertContractTermination(Number.NaN)

    expect(result).toEqual({ ok: false, error: 'Contrato no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige HISTORIAL_WRITE antes de ir a la base', async () => {
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(revertContractTermination(5)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.HISTORIAL_WRITE)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('revierte y revalida el perfil y la lista de pendientes de liquidar', async () => {
    const client = mockRpc({ data: null, error: null })

    const result = await revertContractTermination(5)

    expect(result).toEqual({ ok: true })
    expect(client.rpc).toHaveBeenCalledWith('revertir_terminacion', { p_lab_id: 5 })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/[id]', 'page')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll/aguinaldo-liquidacion')
  })

  it('un contrato ya liquidado no se revierte: muestra el motivo de la RPC', async () => {
    mockRpc({
      data: null,
      error: {
        code: '23514',
        message: 'Este contrato ya fue liquidado: la terminación no se puede revertir.',
      },
    })

    const result = await revertContractTermination(5)

    expect(result).toEqual({
      ok: false,
      error: 'Este contrato ya fue liquidado: la terminación no se puede revertir.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
