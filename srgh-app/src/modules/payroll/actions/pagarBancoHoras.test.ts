import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pagarBancoHoras } from './pagarBancoHoras'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
// lineasNomina importa 'server-only', que revienta fuera de Next.js.
vi.mock('server-only', () => ({}))

import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const OK = { data: null, error: null }
/** El UPDATE de montos (solo si la fila sigue sin pagar) devuelve la fila que tocó. */
const FILA_ACTUALIZADA = { data: [{ ndt_id: 50 }], error: null }
/** La reserva del movimiento (UPDATE … WHERE pendiente) devuelve la fila que tomó. */
const RESERVADO = { data: [{ bhm_id: 1 }], error: null }

const MOVIMIENTO_PENDIENTE = { bhm_id: 1, bhm_historial_laboral_id: 5, bhm_estado: 'pendiente' }

const DETALLE_BORRADOR = {
  ndt_id: 50,
  ndt_pagado: false,
  ndt_horas_ordinarias_diurnas: 88,
  ndt_salario_por_hora: 2500,
  ndt_nomina_periodo_id: 9,
  sgrh_nomina_periodo: {
    npe_estado: 'borrador',
    npe_periodo_mes: 7,
    npe_periodo_anio: 2026,
    npe_quincena: 1,
    npe_fecha_inicio_periodo: '2026-07-01',
  },
}

const CONCEPTOS_ACTIVOS = [
  { con_id: 1, con_codigo: 'BASE', con_tipo_calculo: 'monto_manual_ingreso', con_porcentaje: null },
  {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  },
]

const PRESTAMO_CONCEPTO = {
  con_id: 7,
  con_codigo: 'PRESTAMO',
  con_afecta_salario_bruto: true,
  con_afecta_base_ccss: true,
  con_tipo_calculo: 'monto_manual_deduccion',
  con_porcentaje: null,
}

const HORAS_EXTRA_CONCEPTO = {
  con_id: 4,
  con_codigo: 'HORAS_EXTRA',
  con_afecta_salario_bruto: true,
  con_afecta_base_ccss: true,
  con_tipo_calculo: 'horas_extra_automatico',
  con_porcentaje: 150,
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock({
    // ¿La quincena destino ya va en una liquidación? Por defecto no.
    sgrh_historial_laboral: { data: [], error: null },
    sgrh_liquidaciones: { data: [], error: null },
    ...responses,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('pagarBancoHoras (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un monto inválido sin llamar a Supabase', async () => {
    const result = await pagarBancoHoras({ bhmId: 1, monto: -5 })

    expect(result).toEqual({ ok: false, error: 'Datos inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el movimiento no existe', async () => {
    mockSupabase({ sgrh_banco_horas_movimientos: { data: null, error: null } })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result).toEqual({ ok: false, error: 'El movimiento no existe o no es visible.' })
  })

  it('rechaza si el movimiento ya fue resuelto', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: {
        data: { ...MOVIMIENTO_PENDIENTE, bhm_estado: 'compensado' },
        error: null,
      },
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
  })

  it('avisa si el empleado no tiene una quincena sin pagar en un periodo abierto', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: { data: MOVIMIENTO_PENDIENTE, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('ninguna quincena sin pagar en un periodo abierto')
    }
  })

  it('avisa si el concepto HORAS_EXTRA no existe en el catálogo, y deja el movimiento pendiente', async () => {
    const client = mockSupabase({
      sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO, OK],
      sgrh_nomina_detalle: { data: [DETALLE_BORRADOR], error: null },
      sgrh_cat_conceptos_nomina: [
        { data: CONCEPTOS_ACTIVOS, error: null },
        { data: null, error: null },
      ],
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('HORAS_EXTRA')
    }
    // Se reservó y, como no llegó a la planilla, se devolvió a pendiente.
    const updates = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_banco_horas_movimientos')
      .flatMap((r) => (r.value as { update: { mock: { calls: unknown[][] } } }).update.mock.calls)
      .map((c) => c[0] as { bhm_estado: string })
    expect(updates.map((u) => u.bhm_estado)).toEqual(['pagado', 'pendiente'])
  })

  // Si falla después de escribir los montos de la fila, parte del pago ya
  // está en la planilla: devolver el movimiento a pendiente permitía pagarlo
  // otra vez encima.
  it('si el pago queda a medias en la planilla, el movimiento no vuelve a pendiente', async () => {
    const client = mockSupabase({
      sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO, OK],
      sgrh_nomina_detalle: [{ data: [DETALLE_BORRADOR], error: null }, FILA_ACTUALIZADA],
      sgrh_cat_conceptos_nomina: [
        { data: CONCEPTOS_ACTIVOS, error: null },
        { data: HORAS_EXTRA_CONCEPTO, error: null },
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [{ ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } }],
          error: null,
        },
        { data: [], error: null },
        { data: null, error: { message: 'boom' } },
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [OK, OK],
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('quedó a medias')
    const estados = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_banco_horas_movimientos')
      .flatMap((r) => (r.value as { update: { mock: { calls: unknown[][] } } }).update.mock.calls)
      .map((c) => (c[0] as { bhm_estado: string }).bhm_estado)
    expect(estados).toEqual(['pagado'])
  })

  // Dos personas pagando el mismo movimiento a la vez: la segunda ya no lo
  // encuentra pendiente al reservarlo y no suma nada a la planilla.
  it('si otro lo pagó entre la lectura y el pago, no suma el monto otra vez', async () => {
    const client = mockSupabase({
      sgrh_banco_horas_movimientos: [
        { data: MOVIMIENTO_PENDIENTE, error: null },
        { data: [], error: null },
      ],
      sgrh_nomina_detalle: { data: [DETALLE_BORRADOR], error: null },
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
    const tablas = client.from.mock.calls.map((c) => c[0])
    expect(tablas).not.toContain('sgrh_nomina_linea_ingreso')
    expect(tablas).not.toContain('sgrh_cat_conceptos_nomina')
  })

  it('paga el monto: lo suma como ingreso al periodo en borrador y marca el movimiento como pagado', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO],
      sgrh_nomina_detalle: [{ data: [DETALLE_BORRADOR], error: null }, FILA_ACTUALIZADA],
      sgrh_cat_conceptos_nomina: [
        { data: CONCEPTOS_ACTIVOS, error: null },
        { data: HORAS_EXTRA_CONCEPTO, error: null },
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [{ ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } }],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [OK, OK],
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result).toEqual({ ok: true, periodoLabel: 'Julio 2026 · 1ª quincena' })
  })

  it('acumula el monto si el periodo destino ya tenía un pago previo de banco de horas', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO],
      sgrh_nomina_detalle: [{ data: [DETALLE_BORRADOR], error: null }, FILA_ACTUALIZADA],
      sgrh_cat_conceptos_nomina: [
        { data: CONCEPTOS_ACTIVOS, error: null },
        { data: HORAS_EXTRA_CONCEPTO, error: null },
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [
            { ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } },
            { ing_monto: 15000, sgrh_cat_conceptos_nomina: { con_codigo: 'HORAS_EXTRA' } },
          ],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [OK, OK],
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    // No revienta ni pierde el ingreso previo de HORAS_EXTRA (15000 + 30000).
    expect(result).toEqual({ ok: true, periodoLabel: 'Julio 2026 · 1ª quincena' })
  })
  // Regresion: antes solo se releian las lineas de INGRESO del periodo
  // destino, pero mas abajo se borran ingresos Y deducciones para reinsertar
  // lo recalculado. Resultado: pagar banco de horas borraba el prestamo (o el
  // embargo, o la renta) de esa quincena y el empleado cobraba de mas.
  it('conserva las deducciones manuales del periodo destino al pagar el banco de horas', async () => {
    const client = mockSupabase({
      sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO],
      sgrh_nomina_detalle: [{ data: [DETALLE_BORRADOR], error: null }, FILA_ACTUALIZADA],
      sgrh_cat_conceptos_nomina: [
        { data: [...CONCEPTOS_ACTIVOS, PRESTAMO_CONCEPTO], error: null },
        { data: HORAS_EXTRA_CONCEPTO, error: null },
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [{ ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } }],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [
        {
          data: [
            {
              ded_monto: 20000,
              sgrh_cat_conceptos_nomina: {
                con_codigo: 'PRESTAMO',
                con_afecta_salario_bruto: true,
                con_afecta_base_ccss: true,
                con_tipo_calculo: 'monto_manual_deduccion',
              },
            },
          ],
          error: null,
        },
        OK,
        OK,
      ],
    })

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result.ok).toBe(true)

    const filasInsertadas = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_linea_deduccion')
      .flatMap((r) => {
        const insert = r.value.insert as { mock: { calls: unknown[][] } }
        return insert.mock.calls.flatMap((args) => args[0] as Record<string, unknown>[])
      })

    // El prestamo sigue ahi con su monto intacto...
    expect(filasInsertadas).toContainEqual(
      expect.objectContaining({ ded_concepto_id: 7, ded_monto: 20000 })
    )
    // ...y la CCSS se recalculo sobre el bruto nuevo (100000 + 30000) * 10,83%
    expect(filasInsertadas).toContainEqual(
      expect.objectContaining({ ded_concepto_id: 6, ded_monto: 14079 })
    )
  })

  describe('quincena destino', () => {
    const PAGADA_RECIENTE = {
      ...DETALLE_BORRADOR,
      ndt_id: 60,
      ndt_pagado: true,
      ndt_nomina_periodo_id: 10,
      sgrh_nomina_periodo: {
        ...DETALLE_BORRADOR.sgrh_nomina_periodo,
        npe_quincena: 2,
        npe_fecha_inicio_periodo: '2026-07-16',
      },
    }
    const EXITO = {
      sgrh_cat_conceptos_nomina: [
        { data: CONCEPTOS_ACTIVOS, error: null },
        { data: HORAS_EXTRA_CONCEPTO, error: null },
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [{ ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } }],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [OK, OK],
    }

    /** ndt_id de la fila a la que se le sumaron las horas (el UPDATE de montos). */
    function filaPagada(client: ReturnType<typeof mockSupabase>) {
      const llamadas = client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle')
        .map(
          (r) =>
            r.value as {
              update: { mock: { calls: unknown[][] } }
              eq: { mock: { calls: unknown[][] } }
            }
        )
        .filter((b) => b.update.mock.calls.length > 0)
      return llamadas.flatMap((b) =>
        b.eq.mock.calls.filter((c) => c[0] === 'ndt_id').map((c) => c[1])
      )
    }

    it('salta una fila ya pagada de un periodo en borrador y usa la quincena sin pagar', async () => {
      const client = mockSupabase({
        sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO],
        sgrh_nomina_detalle: [
          { data: [PAGADA_RECIENTE, DETALLE_BORRADOR], error: null },
          FILA_ACTUALIZADA,
        ],
        ...EXITO,
      })

      const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

      expect(result).toEqual({ ok: true, periodoLabel: 'Julio 2026 · 1ª quincena' })
      expect(filaPagada(client)).toEqual([50])
    })

    it('si la única fila abierta ya está pagada, no paga nada', async () => {
      const client = mockSupabase({
        sgrh_banco_horas_movimientos: { data: MOVIMIENTO_PENDIENTE, error: null },
        sgrh_nomina_detalle: { data: [PAGADA_RECIENTE], error: null },
      })

      const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('ninguna quincena sin pagar')
      const movimientos = client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_banco_horas_movimientos')
        .flatMap((r) => (r.value as { update: { mock: { calls: unknown[][] } } }).update.mock.calls)
      expect(movimientos).toEqual([])
    })

    it('salta la quincena que ya paga una liquidación', async () => {
      const client = mockSupabase({
        sgrh_banco_horas_movimientos: { data: MOVIMIENTO_PENDIENTE, error: null },
        sgrh_nomina_detalle: { data: [DETALLE_BORRADOR], error: null },
        sgrh_historial_laboral: {
          data: [{ lab_id: 5, lab_empleado_id: 500, lab_fecha_inicio: '2024-01-01' }],
          error: null,
        },
        sgrh_liquidaciones: {
          data: [
            {
              liq_id: 9,
              liq_historial_laboral_id: 5,
              liq_fecha_salida: '2026-07-10',
              liq_dias_trabajados_mes: 10,
              sgrh_historial_laboral: { lab_empleado_id: 500 },
            },
          ],
          error: null,
        },
      })

      const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('ninguna quincena sin pagar')
      expect(filaPagada(client)).toEqual([])
    })

    it('si alguien marcó la fila pagada mientras tanto, no la toca y devuelve el movimiento a pendiente', async () => {
      const client = mockSupabase({
        sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PENDIENTE, error: null }, RESERVADO, OK],
        // El UPDATE con ndt_pagado = false no encuentra la fila.
        sgrh_nomina_detalle: [
          { data: [DETALLE_BORRADOR], error: null },
          { data: [], error: null },
        ],
        ...EXITO,
      })

      const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('ya está marcada como pagada')
      const estados = client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_banco_horas_movimientos')
        .flatMap((r) => (r.value as { update: { mock: { calls: unknown[][] } } }).update.mock.calls)
        .map((c) => (c[0] as { bhm_estado: string }).bhm_estado)
      expect(estados).toEqual(['pagado', 'pendiente'])
      // Las líneas de la fila no se borran ni se reescriben.
      const escrituras = client.from.mock.results
        .filter((_, i) => String(client.from.mock.calls[i][0]).startsWith('sgrh_nomina_linea_'))
        .flatMap((r) => {
          const b = r.value as {
            insert: { mock: { calls: unknown[] } }
            delete: { mock: { calls: unknown[] } }
          }
          return [...b.insert.mock.calls, ...b.delete.mock.calls]
        })
      expect(escrituras).toEqual([])
    })
  })
})
