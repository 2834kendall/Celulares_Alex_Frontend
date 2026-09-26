import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revertirBancoHoras } from './revertirBancoHoras'
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

const MOVIMIENTO_PAGADO = {
  bhm_id: 1,
  bhm_estado: 'pagado',
  bhm_monto_pagado: 30000,
  bhm_nomina_detalle_pago_id: 50,
}

const DETALLE_BORRADOR = {
  ndt_id: 50,
  ndt_pagado: false,
  ndt_horas_ordinarias_diurnas: 88,
  ndt_horas_extra_al_50: 0,
  ndt_salario_por_hora: 2500,
  ndt_nomina_periodo_id: 9,
  sgrh_nomina_periodo: { npe_estado: 'borrador' },
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
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Escenario completo de un pago reversible: periodo en borrador, sin marcar. */
function mockEscenarioReversible(
  over: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]> = {}
) {
  return mockSupabase({
    sgrh_banco_horas_movimientos: [{ data: MOVIMIENTO_PAGADO, error: null }, OK],
    sgrh_nomina_detalle: [{ data: DETALLE_BORRADOR, error: null }, OK],
    sgrh_cat_conceptos_nomina: [
      { data: CONCEPTOS_ACTIVOS, error: null },
      { data: HORAS_EXTRA_CONCEPTO, error: null },
    ],
    sgrh_nomina_linea_ingreso: [
      {
        data: [
          { ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } },
          { ing_monto: 30000, sgrh_cat_conceptos_nomina: { con_codigo: 'HORAS_EXTRA' } },
        ],
        error: null,
      },
      OK,
      OK,
    ],
    sgrh_nomina_linea_patronal: { data: null, error: null },
    sgrh_nomina_linea_deduccion: [OK, OK],
    ...over,
  })
}

/** Filas realmente insertadas en una tabla, para ver qué quedó en la planilla. */
function filasInsertadas(client: ReturnType<typeof mockSupabase>, tabla: string) {
  return client.from.mock.results
    .filter((_, i) => client.from.mock.calls[i][0] === tabla)
    .flatMap((r) => {
      const insert = (r.value as { insert: { mock: { calls: unknown[][] } } }).insert
      return insert.mock.calls.flatMap((args) => args[0] as Record<string, unknown>[])
    })
}

describe('revertirBancoHoras (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un id inválido sin llamar a Supabase', async () => {
    const result = await revertirBancoHoras(0)

    expect(result).toEqual({ ok: false, error: 'Movimiento inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el movimiento ya está pendiente', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: {
        data: { ...MOVIMIENTO_PAGADO, bhm_estado: 'pendiente' },
        error: null,
      },
    })

    const result = await revertirBancoHoras(1)

    expect(result).toEqual({ ok: false, error: 'Estas horas ya están pendientes en el banco.' })
  })

  // El candado que más importa: si el pago de la quincena ya se marcó, el
  // empleado ya tiene la plata y el comprobante emitido. Sacarle el monto por
  // detrás cambiaría un pago hecho.
  it('no revierte si al empleado ya se le marcó el pago de esa quincena', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: { data: MOVIMIENTO_PAGADO, error: null },
      sgrh_nomina_detalle: { data: { ...DETALLE_BORRADOR, ndt_pagado: true }, error: null },
    })

    const result = await revertirBancoHoras(1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Desmarcá ese pago primero')
  })

  it('no revierte si el periodo ya salió de borrador', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: { data: MOVIMIENTO_PAGADO, error: null },
      sgrh_nomina_detalle: {
        data: { ...DETALLE_BORRADOR, sgrh_nomina_periodo: { npe_estado: 'cerrado' } },
        error: null,
      },
    })

    const result = await revertirBancoHoras(1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('no está en borrador')
  })

  it('saca el monto de la planilla, recalcula la CCSS y devuelve el movimiento a pendiente', async () => {
    const client = mockEscenarioReversible()

    const result = await revertirBancoHoras(1)

    expect(result).toEqual({ ok: true })

    // La línea de HORAS_EXTRA desaparece: 30000 - 30000 = 0.
    const ingresos = filasInsertadas(client, 'sgrh_nomina_linea_ingreso')
    expect(ingresos.some((f) => f.ing_concepto_id === 4)).toBe(false)
    expect(ingresos).toContainEqual(expect.objectContaining({ ing_concepto_id: 1 }))

    // Y la CCSS obrera vuelve a calcularse sobre el bruto sin las extra:
    // 100000 * 10,83% = 10830. Si no se recalculara, el empleado seguiría
    // pagando la CCSS de un ingreso que ya no recibe.
    expect(filasInsertadas(client, 'sgrh_nomina_linea_deduccion')).toContainEqual(
      expect.objectContaining({ ded_concepto_id: 6, ded_monto: 10830 })
    )

    // El movimiento queda limpio: sin monto, sin periodo y sin quién lo resolvió.
    const update = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_banco_horas_movimientos')
      .flatMap((r) => {
        const fn = (r.value as { update: { mock: { calls: unknown[][] } } }).update
        return fn.mock.calls.map((args) => args[0] as Record<string, unknown>)
      })
    expect(update).toContainEqual({
      bhm_estado: 'pendiente',
      bhm_monto_pagado: null,
      bhm_nomina_detalle_pago_id: null,
      bhm_resuelto_por_id: null,
      bhm_fecha_resolucion: null,
    })
  })

  // Un movimiento compensado (se le dio tiempo libre en vez de plata) nunca
  // tocó una planilla, así que devolverlo al banco no tiene nada que restar.
  it('un movimiento compensado vuelve a pendiente sin tocar ninguna planilla', async () => {
    const client = mockSupabase({
      sgrh_banco_horas_movimientos: [
        {
          data: {
            ...MOVIMIENTO_PAGADO,
            bhm_estado: 'compensado',
            bhm_monto_pagado: null,
            bhm_nomina_detalle_pago_id: null,
          },
          error: null,
        },
        OK,
      ],
    })

    const result = await revertirBancoHoras(1)

    expect(result).toEqual({ ok: true })
    expect(client.from.mock.calls.map((c) => c[0])).not.toContain('sgrh_nomina_detalle')
  })

  // Antes esto se recortaba a cero en silencio. Si en la quincena hay dos
  // pagos del banco (30 000 + 20 000) y el primero se revierte dos veces
  // —pasa cuando el update del movimiento falla y el encargado vuelve a
  // apretar el botón— el recorte se comía los 20 000 del OTRO movimiento, que
  // seguía marcado como pagado apuntando a plata que ya no estaba.
  it('no revierte si la quincena ya no tiene ese monto en horas extra', async () => {
    const client = mockEscenarioReversible({
      sgrh_nomina_linea_ingreso: [
        {
          data: [
            { ing_monto: 100000, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } },
            // Solo quedan 20 000 y el movimiento dice haber pagado 30 000.
            { ing_monto: 20000, sgrh_cat_conceptos_nomina: { con_codigo: 'HORAS_EXTRA' } },
          ],
          error: null,
        },
        OK,
        OK,
      ],
    })

    const result = await revertirBancoHoras(1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Alguien ya cambió ese monto')

    // Y no se tocó nada: ni las líneas ni el movimiento.
    expect(filasInsertadas(client, 'sgrh_nomina_linea_ingreso')).toEqual([])
  })

  it('avisa si un movimiento pagado no dice en qué periodo se pagó', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: {
        data: { ...MOVIMIENTO_PAGADO, bhm_nomina_detalle_pago_id: null },
        error: null,
      },
    })

    const result = await revertirBancoHoras(1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Revisalo a mano')
  })
})
