import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { terminateContract } from './terminateContract'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { TerminarContratoInput } from '@/modules/employees/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const INPUT: TerminarContratoInput = {
  lab_fecha_fin: '2026-10-15',
  lab_motivo_salida_id: 1,
  lab_recontratable: false,
  lab_observaciones_salida: 'Renunció con preaviso',
}

function mockRpc(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({}, { rpcResponses: { terminar_contrato: result } })
  mockCreateClient.mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequirePermission.mockResolvedValue({} as never)
})

describe('terminateContract', () => {
  it('rechaza un input inválido sin tocar permisos ni base', async () => {
    const result = await terminateContract(5, { ...INPUT, lab_motivo_salida_id: 0 })

    expect(result).toEqual({ ok: false, error: 'Datos de la terminación inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('exige HISTORIAL_WRITE antes de ir a la base', async () => {
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(terminateContract(5, INPUT)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.HISTORIAL_WRITE)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('manda a la RPC la fecha, el motivo, si es recontratable y las observaciones', async () => {
    const client = mockRpc({ data: true, error: null })

    await terminateContract(5, INPUT)

    expect(client.rpc).toHaveBeenCalledWith('terminar_contrato', {
      p_lab_id: 5,
      p_fecha_fin: '2026-10-15',
      p_motivo_id: 1,
      p_recontratable: false,
      p_observaciones: 'Renunció con preaviso',
    })
  })

  it('observaciones vacías no viajan como texto vacío', async () => {
    const client = mockRpc({ data: false, error: null })

    await terminateContract(5, { ...INPUT, lab_observaciones_salida: '' })

    expect(client.rpc).toHaveBeenCalledWith(
      'terminar_contrato',
      expect.objectContaining({ p_observaciones: undefined })
    )
  })

  it('una fecha futura (preaviso) vuelve como terminación programada', async () => {
    mockRpc({ data: true, error: null })

    const result = await terminateContract(5, INPUT)

    expect(result).toEqual({ ok: true, programada: true })
  })

  it('una fecha pasada cierra en el acto', async () => {
    mockRpc({ data: false, error: null })

    const result = await terminateContract(5, { ...INPUT, lab_fecha_fin: '2026-09-01' })

    expect(result).toEqual({ ok: true, programada: false })
  })

  it('revalida el perfil y la lista de pendientes de liquidar', async () => {
    mockRpc({ data: false, error: null })

    await terminateContract(5, INPUT)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/[id]', 'page')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll/aguinaldo-liquidacion')
  })

  it('muestra el rechazo de la RPC tal cual', async () => {
    mockRpc({
      data: null,
      error: { code: '23514', message: 'Este contrato ya está terminado.' },
    })

    const result = await terminateContract(5, INPUT)

    expect(result).toEqual({ ok: false, error: 'Este contrato ya está terminado.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
