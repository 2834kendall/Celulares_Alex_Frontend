import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anularPagoExtraordinario } from './anularPagoExtraordinario'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockRpc(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock(
    {},
    { rpcResponses: { anular_pago_extraordinario: result } }
  )
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('anularPagoExtraordinario (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('valida el id y el motivo antes de tocar la base', async () => {
    const client = mockRpc({ data: null, error: null })

    expect(await anularPagoExtraordinario(0, 'motivo largo')).toEqual({
      ok: false,
      error: 'Pago inválido.',
    })
    expect(await anularPagoExtraordinario(5, '  ab  ')).toEqual({
      ok: false,
      error: 'Escribí el motivo de la anulación (al menos 5 caracteres).',
    })
    expect(await anularPagoExtraordinario(5, 'x'.repeat(501))).toEqual({
      ok: false,
      error: 'El motivo no puede pasar de 500 caracteres.',
    })
    expect(client.rpc).not.toHaveBeenCalled()
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('anula por la función de la base, con el motivo sin espacios de más', async () => {
    const client = mockRpc({ data: { tipo: 'aguinaldo' }, error: null })

    const result = await anularPagoExtraordinario(5, '  Se pagó a la persona equivocada.  ')

    expect(result).toEqual({ ok: true })
    expect(requirePermission).toHaveBeenCalledWith('NOMINA_WRITE')
    expect(client.rpc).toHaveBeenCalledWith('anular_pago_extraordinario', {
      p_pex_id: 5,
      p_motivo: 'Se pagó a la persona equivocada.',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/payroll/aguinaldo-liquidacion')
    expect(revalidatePath).toHaveBeenCalledWith('/comprobante/extraordinario/5')
  })

  it('muestra el mensaje de la base cuando ya pasó el plazo o ya estaba anulado', async () => {
    mockRpc({
      data: null,
      error: {
        code: '55000',
        message: 'Ya pasó el plazo para anular este pago (48 horas desde que se registró).',
      },
    })

    expect(await anularPagoExtraordinario(5, 'motivo largo')).toEqual({
      ok: false,
      error: 'Ya pasó el plazo para anular este pago (48 horas desde que se registró).',
    })
  })

  it('un error técnico no se le muestra tal cual', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc({ data: null, error: { code: '08006', message: 'connection failure' } })

    expect(await anularPagoExtraordinario(5, 'motivo largo')).toEqual({
      ok: false,
      error: 'No se pudo anular el pago. Intentá de nuevo.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
