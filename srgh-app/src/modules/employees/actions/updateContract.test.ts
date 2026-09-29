import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { updateContract } from './updateContract'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { EditarContratoInput } from '@/modules/employees/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const INPUT: EditarContratoInput = {
  lab_puesto_id: 3,
  lab_tipo_contrato_id: 1,
  lab_tipo_jornada_id: 1,
  lab_fecha_inicio: '2026-09-01',
  lab_salario_base: 480000,
  lab_salario_real: 500000,
}

function mockRpc(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({}, { rpcResponses: { editar_contrato: result } })
  mockCreateClient.mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequirePermission.mockResolvedValue({} as never)
})

describe('updateContract', () => {
  it('rechaza un id de contrato inválido sin tocar permisos ni base', async () => {
    const result = await updateContract(-3, INPUT)

    expect(result).toEqual({ ok: false, error: 'Contrato no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un input inválido sin tocar permisos ni base', async () => {
    const result = await updateContract(5, { ...INPUT, lab_fecha_inicio: '01/09/2026' })

    expect(result).toEqual({ ok: false, error: 'Datos del contrato inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('exige HISTORIAL_WRITE antes de ir a la base', async () => {
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(updateContract(5, INPUT)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.HISTORIAL_WRITE)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('la sucursal no viaja a la RPC aunque llegue en el input', async () => {
    const client = mockRpc({ data: null, error: null })

    const result = await updateContract(5, {
      ...INPUT,
      lab_sucursal_id: 9,
    } as EditarContratoInput)

    expect(result).toEqual({ ok: true })
    expect(client.rpc).toHaveBeenCalledWith('editar_contrato', { p_lab_id: 5, p_contrato: INPUT })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/[id]', 'page')
  })

  it('muestra el rechazo de la RPC cuando el contrato ya pasó por planilla', async () => {
    mockRpc({
      data: null,
      error: { code: '23514', message: 'Este contrato ya pasó por planilla y no se puede editar.' },
    })

    const result = await updateContract(5, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Este contrato ya pasó por planilla y no se puede editar.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('un error inesperado cae al mensaje genérico', async () => {
    mockRpc({ data: null, error: { code: 'XX000', message: 'internal error' } })

    const result = await updateContract(5, INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo editar el contrato.' })
  })
})
