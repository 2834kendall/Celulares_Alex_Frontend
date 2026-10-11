import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePeriodo } from './deletePeriodo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const OK = { data: null, error: null }
const PERIODO = { data: { npe_id: 9 }, error: null }

function mockSupabase(
  responses: Record<
    string,
    { data: unknown; error: unknown } | { data: unknown; error: unknown }[]
  >,
  borrado: { data: unknown; error: unknown } = { data: null, error: null }
) {
  const client = createSupabaseClientMock(responses, {
    rpcResponses: { eliminar_periodo_nomina: borrado },
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Builders de las llamadas que se hicieron contra una tabla. */
function builders(client: ReturnType<typeof createSupabaseClientMock>, tabla: string) {
  return client.from.mock.results
    .filter((_, i) => client.from.mock.calls[i][0] === tabla)
    .map((r) => r.value as Record<string, unknown>)
}

/**
 * Si se INVOCÓ un método del query builder. El mock expone select/delete/update
 * en todos los builders, así que preguntar por su existencia siempre da true:
 * lo que interesa es si se llamó.
 */
function seLlamo(builder: Record<string, unknown>, metodo: 'delete' | 'update'): boolean {
  return (builder[metodo] as { mock: { calls: unknown[][] } }).mock.calls.length > 0
}

function alguienLlamo(
  client: ReturnType<typeof createSupabaseClientMock>,
  tabla: string,
  metodo: 'delete' | 'update'
): boolean {
  return builders(client, tabla).some((b) => seLlamo(b, metodo))
}

describe('deletePeriodo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un id inválido sin tocar la base', async () => {
    const result = await deletePeriodo(0)

    expect(result).toEqual({ ok: false, error: 'Periodo inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el periodo no existe o no lo deja ver RLS', async () => {
    mockSupabase({ sgrh_nomina_periodo: { data: null, error: null } })

    const result = await deletePeriodo(9)

    expect(result).toEqual({
      ok: false,
      error: 'El periodo no existe o no es visible.',
    })
  })

  // La regla central: marcar un pago deja rastro fuera del periodo (aguinaldo
  // acumulado y comprobante emitido). Borrarlo por detrás dejaría esas dos
  // cosas apuntando a un pago que ya no existe.
  it('no borra un periodo que ya tiene pagos marcados', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: PERIODO,
      sgrh_nomina_detalle: {
        data: [
          { ndt_id: 1, ndt_pagado: true },
          { ndt_id: 2, ndt_pagado: false },
        ],
        error: null,
      },
    })

    const result = await deletePeriodo(9)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('pagos ya marcados (1)')
      expect(result.error).toContain('Desmarcá')
    }
    // Y no borró nada, ni el detalle ni el periodo.
    expect(alguienLlamo(client, 'sgrh_nomina_detalle', 'delete')).toBe(false)
    expect(alguienLlamo(client, 'sgrh_nomina_periodo', 'delete')).toBe(false)
  })

  it('borra un periodo vacío sin tocar las tablas dependientes', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: [PERIODO, OK],
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const result = await deletePeriodo(9)

    expect(result).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_nomina_linea_ingreso')
    expect(client.from).not.toHaveBeenCalledWith('sgrh_banco_horas_movimientos')
  })

  it('no borra el periodo si sus horas de banco ya se pagaron o compensaron', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: [PERIODO, OK],
      sgrh_nomina_detalle: [{ data: [{ ndt_id: 1, ndt_pagado: false }], error: null }, OK],
      sgrh_banco_horas_movimientos: {
        data: [{ bhm_nomina_detalle_id: 1, bhm_estado: 'pagado' }],
        error: null,
      },
    })

    const result = await deletePeriodo(9)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('ya se pagaron o compensaron')
    for (const tabla of [
      'sgrh_nomina_detalle',
      'sgrh_nomina_periodo',
      'sgrh_banco_horas_movimientos',
    ]) {
      expect(alguienLlamo(client, tabla, 'delete')).toBe(false)
    }
  })

  const DOS_FILAS = {
    sgrh_nomina_periodo: PERIODO,
    sgrh_nomina_detalle: {
      data: [
        { ndt_id: 1, ndt_pagado: false },
        { ndt_id: 2, ndt_pagado: false },
      ],
      error: null,
    },
    sgrh_banco_horas_movimientos: { data: [], error: null },
  }

  // Auditoría, riesgo "borrado sin transacción": todo el borrado (banco de
  // horas, comisiones, comprobantes, líneas, filas y periodo) lo hace la
  // función eliminar_periodo_nomina en una transacción. Desde acá no se borra
  // nada tabla por tabla.
  it('borra el periodo con todo lo que cuelga en una sola transacción', async () => {
    const client = mockSupabase(DOS_FILAS)

    const result = await deletePeriodo(9)

    expect(result).toEqual({ ok: true })
    expect(client.rpc).toHaveBeenCalledWith('eliminar_periodo_nomina', { p_npe_id: 9 })
    for (const tabla of [
      'sgrh_nomina_periodo',
      'sgrh_nomina_detalle',
      'sgrh_banco_horas_movimientos',
      'sgrh_comisiones_calculadas',
      'sgrh_comprobantes_pago',
      'sgrh_nomina_linea_ingreso',
      'sgrh_nomina_linea_deduccion',
      'sgrh_nomina_linea_patronal',
    ]) {
      expect(alguienLlamo(client, tabla, 'delete')).toBe(false)
      expect(alguienLlamo(client, tabla, 'update')).toBe(false)
    }
  })

  it('si la función lo rechaza (algo cambió entre medio), muestra su mensaje', async () => {
    mockSupabase(DOS_FILAS, {
      data: null,
      error: {
        code: '23514',
        message: 'No se puede borrar una fila con el pago marcado: desmarcalo primero.',
      },
    })

    const result = await deletePeriodo(9)

    expect(result).toEqual({
      ok: false,
      error: 'No se puede borrar una fila con el pago marcado: desmarcalo primero.',
    })
  })

  it('un error inesperado no se muestra tal cual', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSupabase(DOS_FILAS, {
      data: null,
      error: { code: 'XX000', message: 'relation sgrh_algo does not exist' },
    })

    const result = await deletePeriodo(9)

    expect(result).toEqual({ ok: false, error: 'No se pudo eliminar el periodo.' })
  })
})
