import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePeriodo } from './deletePeriodo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

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
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
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

  it('borra el periodo y todo lo que cuelga de sus detalles', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: [PERIODO, OK],
      sgrh_nomina_detalle: [
        {
          data: [
            { ndt_id: 1, ndt_pagado: false },
            { ndt_id: 2, ndt_pagado: false },
          ],
          error: null,
        },
        OK,
      ],
      sgrh_banco_horas_movimientos: OK,
      sgrh_comisiones_calculadas: OK,
      sgrh_comprobantes_pago: OK,
      sgrh_nomina_linea_ingreso: OK,
      sgrh_nomina_linea_deduccion: OK,
      sgrh_nomina_linea_patronal: OK,
    })

    const result = await deletePeriodo(9)

    expect(result).toEqual({ ok: true })

    for (const tabla of [
      'sgrh_comprobantes_pago',
      'sgrh_nomina_linea_ingreso',
      'sgrh_nomina_linea_deduccion',
      'sgrh_nomina_linea_patronal',
      'sgrh_nomina_detalle',
      'sgrh_nomina_periodo',
    ]) {
      expect(alguienLlamo(client, tabla, 'delete')).toBe(true)
    }
  })

  // Las horas de banco que nacieron en OTRA quincena y se pagaron en esta no
  // se borran: vuelven a pendientes. Si se borraran, esas horas extra
  // desaparecerían sin haberse pagado ni compensado.
  it('devuelve a pendientes las horas de banco que se habían pagado en este periodo', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: [PERIODO, OK],
      sgrh_nomina_detalle: [{ data: [{ ndt_id: 1, ndt_pagado: false }], error: null }, OK],
      sgrh_banco_horas_movimientos: OK,
      sgrh_comisiones_calculadas: OK,
      sgrh_comprobantes_pago: OK,
      sgrh_nomina_linea_ingreso: OK,
      sgrh_nomina_linea_deduccion: OK,
      sgrh_nomina_linea_patronal: OK,
    })

    await deletePeriodo(9)

    const banco = builders(client, 'sgrh_banco_horas_movimientos')
    const update = banco.find((b) => seLlamo(b, 'update'))

    expect(update).toBeDefined()
    expect(update!.update).toHaveBeenCalledWith({
      bhm_estado: 'pendiente',
      bhm_monto_pagado: null,
      bhm_nomina_detalle_pago_id: null,
      bhm_resuelto_por_id: null,
      bhm_fecha_resolucion: null,
    })
    // Y además se borran los movimientos generados por este mismo periodo.
    expect(banco.some((b) => seLlamo(b, 'delete'))).toBe(true)
  })

  it('suelta las comisiones en vez de borrarlas', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: [PERIODO, OK],
      sgrh_nomina_detalle: [{ data: [{ ndt_id: 1, ndt_pagado: false }], error: null }, OK],
      sgrh_banco_horas_movimientos: OK,
      sgrh_comisiones_calculadas: OK,
      sgrh_comprobantes_pago: OK,
      sgrh_nomina_linea_ingreso: OK,
      sgrh_nomina_linea_deduccion: OK,
      sgrh_nomina_linea_patronal: OK,
    })

    await deletePeriodo(9)

    const comisiones = builders(client, 'sgrh_comisiones_calculadas')
    expect(comisiones[0].update).toHaveBeenCalledWith({
      cal_nomina_detalle_id: null,
    })
    expect(seLlamo(comisiones[0], 'delete')).toBe(false)
  })

  it('si falla el borrado de las líneas no continúa contra el detalle', async () => {
    const client = mockSupabase({
      sgrh_nomina_periodo: [PERIODO, OK],
      sgrh_nomina_detalle: [{ data: [{ ndt_id: 1, ndt_pagado: false }], error: null }, OK],
      sgrh_banco_horas_movimientos: OK,
      sgrh_comisiones_calculadas: OK,
      sgrh_comprobantes_pago: OK,
      sgrh_nomina_linea_ingreso: { data: null, error: { message: 'boom' } },
      sgrh_nomina_linea_deduccion: OK,
      sgrh_nomina_linea_patronal: OK,
    })

    const result = await deletePeriodo(9)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron eliminar las líneas de la planilla.',
    })
    expect(alguienLlamo(client, 'sgrh_nomina_detalle', 'delete')).toBe(false)
    expect(alguienLlamo(client, 'sgrh_nomina_periodo', 'delete')).toBe(false)
  })
})
