import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { sincronizarEstadoPeriodo, sincronizarPeriodosDeLaSalida } from './estadoPeriodoData'

vi.mock('server-only', () => ({}))
vi.mock('@/modules/payroll/lib/fechas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/payroll/lib/fechas')>()),
  hoyLocal: () => '2026-07-20',
}))

type Cliente = Awaited<ReturnType<typeof createClient>>
type Respuesta = { data: unknown; error: unknown }

const PERIODO = { npe_periodo_anio: 2026, npe_periodo_mes: 7, npe_quincena: 1 }
const CONTRATOS = [
  { lab_id: 9, lab_empleado_id: 501, lab_fecha_inicio: '2025-01-01' },
  { lab_id: 10, lab_empleado_id: 502, lab_fecha_inicio: '2025-01-01' },
]
// Salida el 10 de julio con 10 días pendientes: paga la 1.ª quincena de julio.
const LIQ_DE_9 = {
  liq_id: 77,
  liq_historial_laboral_id: 9,
  liq_fecha_salida: '2026-07-10',
  liq_dias_trabajados_mes: 10,
  sgrh_historial_laboral: { lab_empleado_id: 501 },
}

function cliente(tablas: Record<string, Respuesta | Respuesta[]>) {
  const mock = createSupabaseClientMock({
    sgrh_nomina_periodo: { data: PERIODO, error: null },
    sgrh_historial_laboral: { data: CONTRATOS, error: null },
    sgrh_liquidaciones: { data: [], error: null },
    ...tablas,
  })
  return { mock, supabase: mock as unknown as Cliente }
}

/** Los update() hechos sobre sgrh_nomina_periodo, en orden. */
function updatesDelPeriodo(mock: ReturnType<typeof createSupabaseClientMock>) {
  const llamadas = mock.from.mock.calls
  const resultados = mock.from.mock.results
  const updates: unknown[] = []
  llamadas.forEach(([tabla], i) => {
    if (tabla !== 'sgrh_nomina_periodo') return
    const builder = resultados[i].value as { update: ReturnType<typeof vi.fn> }
    for (const [payload] of builder.update.mock.calls) updates.push(payload)
  })
  return updates
}

const pagada = (lab: number, fecha: string) => ({
  ndt_historial_laboral_id: lab,
  ndt_pagado: true,
  ndt_fecha_pago: fecha,
})
const impaga = (lab: number) => ({
  ndt_historial_laboral_id: lab,
  ndt_pagado: false,
  ndt_fecha_pago: null,
})

describe('sincronizarEstadoPeriodo', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('todas pagadas por planilla: pagado con la fecha de pago más reciente', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: {
        data: [pagada(9, '2026-07-15'), pagada(10, '2026-07-18')],
        error: null,
      },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([
      { npe_estado: 'pagado', npe_fecha_pago: '2026-07-18' },
    ])
  })

  it('una fila impaga sin liquidación: vuelve a borrador', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: [pagada(9, '2026-07-15'), impaga(10)], error: null },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })

  it('la única impaga la paga una liquidación: pagado con la fecha de la planilla', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: [impaga(9), pagada(10, '2026-07-15')], error: null },
      sgrh_liquidaciones: { data: [LIQ_DE_9], error: null },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([
      { npe_estado: 'pagado', npe_fecha_pago: '2026-07-15' },
    ])
  })

  it('si TODAS van en liquidaciones queda en borrador: no habría pago que desmarcar para reabrirlo', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: [impaga(9)], error: null },
      sgrh_liquidaciones: { data: [LIQ_DE_9], error: null },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })

  it('una fila pagada sin fecha guardada: pagado con la fecha de hoy', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: {
        data: [{ ...pagada(10, '2026-07-15'), ndt_fecha_pago: null }],
        error: null,
      },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([
      { npe_estado: 'pagado', npe_fecha_pago: '2026-07-20' },
    ])
  })

  it('una liquidación que paga otra quincena no cuenta', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: [impaga(9), pagada(10, '2026-07-15')], error: null },
      sgrh_liquidaciones: {
        data: [{ ...LIQ_DE_9, liq_fecha_salida: '2026-06-10' }],
        error: null,
      },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })

  it('si no se pueden leer las liquidaciones, el periodo queda abierto', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: [impaga(9), pagada(10, '2026-07-15')], error: null },
      sgrh_liquidaciones: { data: null, error: { message: 'boom' } },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })

  it('si la búsqueda de liquidaciones revienta, no lanza y el periodo queda abierto', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: [impaga(9), pagada(10, '2026-07-15')], error: null },
    })
    const fromOriginal = mock.from.getMockImplementation()!
    mock.from.mockImplementation((tabla: string) => {
      if (tabla === 'sgrh_historial_laboral') throw new Error('red caída')
      return fromOriginal(tabla)
    })

    await expect(sincronizarEstadoPeriodo(supabase, 7)).resolves.toBeUndefined()
    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })

  it('si no se encuentra el periodo, una impaga no se da por resuelta', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_periodo: { data: null, error: null },
      sgrh_nomina_detalle: { data: [impaga(9)], error: null },
      sgrh_liquidaciones: { data: [LIQ_DE_9], error: null },
    })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })

  it('un periodo sin filas nunca pasa a pagado', async () => {
    const { mock, supabase } = cliente({ sgrh_nomina_detalle: { data: [], error: null } })

    await sincronizarEstadoPeriodo(supabase, 7)

    expect(updatesDelPeriodo(mock)).toEqual([{ npe_estado: 'borrador', npe_fecha_pago: null }])
  })
})

describe('sincronizarPeriodosDeLaSalida', () => {
  it('recalcula solo los periodos del mes de salida con una fila impaga', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: [
        // 1.ª consulta: filas impagas de la relación laboral.
        {
          data: [
            {
              ndt_nomina_periodo_id: 7,
              sgrh_nomina_periodo: { npe_periodo_anio: 2026, npe_periodo_mes: 7 },
            },
            {
              ndt_nomina_periodo_id: 7,
              sgrh_nomina_periodo: { npe_periodo_anio: 2026, npe_periodo_mes: 7 },
            },
            // Otro mes: no se toca.
            {
              ndt_nomina_periodo_id: 3,
              sgrh_nomina_periodo: { npe_periodo_anio: 2026, npe_periodo_mes: 5 },
            },
          ],
          error: null,
        },
        // 2.ª: las filas del periodo 7.
        { data: [impaga(9), pagada(10, '2026-07-15')], error: null },
      ],
      sgrh_liquidaciones: { data: [LIQ_DE_9], error: null },
    })

    await sincronizarPeriodosDeLaSalida(supabase, [9], '2026-07-10')

    const periodosLeidos = mock.from.mock.results
      .filter((_, i) => mock.from.mock.calls[i][0] === 'sgrh_nomina_periodo')
      .flatMap((r) => (r.value as { eq: ReturnType<typeof vi.fn> }).eq.mock.calls)
      .map(([, id]) => id)
    expect(new Set(periodosLeidos)).toEqual(new Set([7]))
    expect(updatesDelPeriodo(mock)).toEqual([
      { npe_estado: 'pagado', npe_fecha_pago: '2026-07-15' },
    ])
  })

  it('sin contratos no consulta nada', async () => {
    const { mock, supabase } = cliente({})

    await sincronizarPeriodosDeLaSalida(supabase, [], '2026-07-10')

    expect(mock.from).not.toHaveBeenCalled()
  })

  it('si falla la búsqueda de filas impagas, no toca ningún periodo', async () => {
    const { mock, supabase } = cliente({
      sgrh_nomina_detalle: { data: null, error: { message: 'boom' } },
    })

    await sincronizarPeriodosDeLaSalida(supabase, [9], '2026-07-10')

    expect(updatesDelPeriodo(mock)).toEqual([])
  })
})
