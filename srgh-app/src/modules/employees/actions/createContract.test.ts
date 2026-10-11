import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createContract } from './createContract'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { CrearHistorialLaboralInput } from '@/modules/employees/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const INPUT: CrearHistorialLaboralInput = {
  lab_puesto_id: 3,
  lab_sucursal_id: 2,
  lab_tipo_contrato_id: 1,
  lab_tipo_jornada_id: 1,
  lab_fecha_inicio: '2026-10-01',
  lab_salario_base: 450000,
  lab_salario_real: 450000,
}

function mockRpc(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({}, { rpcResponses: { crear_contrato: result } })
  mockCreateClient.mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequirePermission.mockResolvedValue({} as never)
})

describe('createContract', () => {
  it('rechaza un id de empleado inválido sin tocar permisos ni base', async () => {
    const result = await createContract(0, INPUT)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza un input inválido sin tocar permisos ni base', async () => {
    const result = await createContract(10, { ...INPUT, lab_salario_base: -1 })

    expect(result).toEqual({ ok: false, error: 'Datos del contrato inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('exige HISTORIAL_WRITE antes de ir a la base', async () => {
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(createContract(10, INPUT)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.HISTORIAL_WRITE)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('llama a la RPC con el empleado y el contrato validado', async () => {
    const client = mockRpc({ data: 77, error: null })

    const result = await createContract(10, INPUT)

    expect(result).toEqual({ ok: true })
    expect(client.rpc).toHaveBeenCalledWith('crear_contrato', {
      p_empleado_id: 10,
      p_contrato: INPUT,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('muestra el mensaje de la RPC cuando rechaza por una regla de negocio', async () => {
    mockRpc({
      data: null,
      error: { code: '23514', message: 'El contrato anterior todavía está pendiente de liquidar.' },
    })

    const result = await createContract(10, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'El contrato anterior todavía está pendiente de liquidar.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('traduce el choque con el índice único (dos personas guardando a la vez)', async () => {
    mockRpc({ data: null, error: { code: '23505', message: 'ux_historial_un_contrato_vigente' } })

    const result = await createContract(10, INPUT)

    expect(result).toEqual({ ok: false, error: 'Este empleado ya tiene un contrato vigente.' })
  })

  it('un error inesperado no filtra el mensaje de Postgres', async () => {
    mockRpc({ data: null, error: { code: '08006', message: 'connection to server lost' } })

    const result = await createContract(10, INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo registrar el contrato.' })
  })
})
