import { beforeEach, describe, expect, it, vi } from 'vitest'
import { procesarLiquidacion } from './procesarLiquidacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ProcesarLiquidacionInput } from '@/modules/payroll/types'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

/** Ingresó el 15 de enero de 2020 con ₡300.000 al mes. */
const HISTORIAL = {
  lab_id: 1,
  lab_fecha_inicio: '2020-01-15',
  lab_fecha_fin: null,
  lab_salario_base: 300000,
  lab_salario_real: 300000,
  sgrh_empleados: { emp_fecha_ingreso_original: '2020-01-15' },
}

// Renuncia sin responsabilidad patronal: no genera cesantía ni preaviso.
const MOTIVO_SIN_DERECHOS = { mot_id: 5, mot_genera_cesantia: false, mot_genera_preaviso: false }
// Despido injustificado: genera ambos.
const MOTIVO_CON_DERECHOS = { mot_id: 6, mot_genera_cesantia: true, mot_genera_preaviso: true }

/** Solo la CCSS obrera del catálogo, como en el seed. */
const CONCEPTOS_DEDUCCION = [
  { con_tipo: 'deduccion', con_tipo_calculo: 'porcentaje_deduccion_bruto', con_porcentaje: 10.83 },
]

/** Sale el 20 de enero de 2026: 6 años y 5 días de antigüedad. */
const INPUT: ProcesarLiquidacionInput = {
  historialLaboralId: 1,
  fechaSalida: '2026-01-20',
  motivoSalidaId: 5,
  diasVacacionesPendientes: 10,
}

const INSERTED = { data: { liq_id: 100 }, error: null }
/** El UPDATE de cierre devuelve la fila que tocó: así se sabe que no fue 0. */
const CERRADO = { data: [{ lab_id: 1 }], error: null }

type Respuesta = { data: unknown; error: unknown }

function mockSupabase(responses: Record<string, Respuesta | Respuesta[]>) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Una quincena pagada (o no) de la planilla, con su periodo. */
function quincena(anio: number, mes: number, quincena: number, bruto: number, pagado = true) {
  return {
    ndt_salario_bruto: bruto,
    ndt_pagado: pagado,
    sgrh_nomina_periodo: {
      npe_periodo_mes: mes,
      npe_periodo_anio: anio,
      npe_quincena: quincena,
    },
  }
}

/** Las últimas 12 quincenas antes de la salida (jul 2025 Q2 → ene 2026 Q1). */
function seisMesesPagados(bruto = 150000) {
  const filas = [quincena(2025, 7, 2, bruto)]
  for (const mes of [8, 9, 10, 11, 12]) {
    filas.push(quincena(2025, mes, 1, bruto), quincena(2025, mes, 2, bruto))
  }
  filas.push(quincena(2026, 1, 1, bruto))
  return filas
}

function escenario(over: Record<string, Respuesta | Respuesta[]> = {}) {
  return mockSupabase({
    sgrh_historial_laboral: [{ data: HISTORIAL, error: null }, CERRADO],
    sgrh_cat_motivos_salida: { data: MOTIVO_SIN_DERECHOS, error: null },
    sgrh_nomina_detalle: { data: [], error: null },
    sgrh_cat_conceptos_nomina: { data: CONCEPTOS_DEDUCCION, error: null },
    sgrh_liquidaciones: INSERTED,
    ...over,
  })
}

function insercion(client: ReturnType<typeof mockSupabase>) {
  const i = client.from.mock.calls.findIndex((c) => c[0] === 'sgrh_liquidaciones')
  const fn = (client.from.mock.results[i].value as { insert: { mock: { calls: unknown[][] } } })
    .insert
  return fn.mock.calls[0][0] as Record<string, unknown>
}

describe('procesarLiquidacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE', 'HISTORIAL_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos inválidos', async () => {
    const result = await procesarLiquidacion({ ...INPUT, historialLaboralId: 0 })

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el empleado no existe', async () => {
    mockSupabase({ sgrh_historial_laboral: { data: null, error: null } })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'El empleado no existe o no es visible.' })
  })

  it('rechaza si el empleado ya tiene una salida registrada', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: { ...HISTORIAL, lab_fecha_fin: '2025-01-01' }, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'Este empleado ya tiene una salida registrada.' })
  })

  it('rechaza una salida anterior al ingreso', async () => {
    mockSupabase({ sgrh_historial_laboral: { data: HISTORIAL, error: null } })

    const result = await procesarLiquidacion({ ...INPUT, fechaSalida: '2019-12-31' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('anterior a la de ingreso')
  })

  it('rechaza si el motivo de salida no existe', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: HISTORIAL, error: null },
      sgrh_cat_motivos_salida: { data: null, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'El motivo de salida no existe.' })
  })

  // Sin quincenas pagadas no hay promedio: se usa el contrato (₡300.000 ÷ 30
  // = ₡10.000) y se avisa. Sale el 20 sin nada pagado ese mes: 20 días.
  it('con un motivo que NO genera cesantía ni preaviso, los guarda en 0', async () => {
    escenario()

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      liqId: 100,
      salarioDiario: 10000,
      diasSalarioPendiente: 20,
      salarioProporcional: 200000,
      // El salario pendiente también es salario del ciclo: (0 + 200000) / 12
      aguinaldoProporcional: 16666.67,
      vacacionesPagadas: 100000,
      diasPreaviso: 0,
      preaviso: 0,
      diasCesantia: 0,
      cesantia: 0,
      total: 316666.67,
      // CCSS 10,83 % solo sobre salario pendiente + vacaciones.
      deduccionesObreras: 32490,
      neto: 284176.67,
    })
    expect(result.data.advertencias.some((a) => a.includes('salario del contrato'))).toBe(true)
  })

  it('con un motivo que SÍ genera cesantía y preaviso, calcula ambos montos', async () => {
    escenario({ sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null } })

    const result = await procesarLiquidacion({ ...INPUT, motivoSalidaId: 6 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 6 años: un mes de preaviso y la fila del año 6 (21,5) por 6 años.
    expect(result.data.diasPreaviso).toBe(30)
    expect(result.data.preaviso).toBe(300000)
    expect(result.data.diasCesantia).toBe(129)
    expect(result.data.cesantia).toBe(1290000)
    expect(result.data.total).toBe(1906666.67)
    // Preaviso y cesantía no cotizan: la deducción es la misma que sin ellos.
    expect(result.data.deduccionesObreras).toBe(32490)
    expect(result.data.neto).toBe(1874176.67)
  })

  // El bug que había: seis QUINCENAS (tres meses) divididas entre 30 como si
  // cada una fuera un mes. Daba la mitad del salario diario, y con él la mitad
  // de la cesantía y del preaviso.
  it('promedia los últimos seis meses de quincenas pagadas, no seis quincenas', async () => {
    const client = escenario({
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null },
    })

    const result = await procesarLiquidacion({ ...INPUT, motivoSalidaId: 6 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 12 quincenas de 150.000 = 300.000 al mes → 10.000 diario. Antes daba 5.000.
    expect(result.data.salarioDiario).toBe(10000)
    expect(result.data.preaviso).toBe(300000)
    expect(result.data.cesantia).toBe(1290000)
    expect(result.data.advertencias).toEqual([])
    expect(insercion(client)).toMatchObject({ liq_salario_diario: 10000 })
  })

  // Sale el 20 con la primera quincena de enero ya pagada: se le deben los
  // días 16 a 20, no del 1 al 20. Antes se pagaba la primera quincena dos veces.
  it('el salario pendiente descuenta la quincena ya pagada del mes de salida', async () => {
    escenario({ sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null } })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.diasSalarioPendiente).toBe(5)
    expect(result.data.salarioProporcional).toBe(50000)
  })

  it('el aguinaldo proporcional suma lo pagado desde diciembre más el salario pendiente', async () => {
    escenario({ sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null } })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Ciclo 2026: dic 2025 (2 quincenas) + ene 2026 Q1 = 450.000, más 50.000 pendientes.
    expect(result.data.aguinaldoProporcional).toBe(41666.67)
  })

  // Una quincena en borrador no es plata devengada todavía, pero tampoco se
  // esconde: quien firma el finiquito tiene que saber que quedó fuera.
  it('avisa por nombre las quincenas sin pagar que quedaron fuera', async () => {
    const client = escenario({
      sgrh_nomina_detalle: {
        data: [...seisMesesPagados(150000), quincena(2026, 1, 2, 150000, false)],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const aviso = result.data.advertencias.find((a) => a.includes('sin marcar como pagadas'))
    expect(aviso).toContain('Enero 2026 · 2ª quincena')
    // Queda escrito en la liquidación, no solo en el toast.
    expect(insercion(client).liq_observaciones).toContain('Enero 2026 · 2ª quincena')
  })

  it('si la quincena de salida ya se pagó, no incluye salario pendiente y lo dice', async () => {
    escenario({
      sgrh_nomina_detalle: {
        data: [...seisMesesPagados(150000), quincena(2026, 1, 2, 150000, true)],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.diasSalarioPendiente).toBe(0)
    expect(result.data.salarioProporcional).toBe(0)
    expect(result.data.advertencias.some((a) => a.includes('ya está marcada como pagada'))).toBe(
      true
    )
  })

  it('guarda deducciones y neto en la liquidación', async () => {
    const client = escenario()

    await procesarLiquidacion(INPUT)

    expect(insercion(client)).toMatchObject({
      liq_total: 316666.67,
      liq_deducciones_obreras: 32490,
      liq_neto: 284176.67,
      liq_dias_trabajados_mes: 20,
    })
  })

  it('si ya existe una liquidación para el empleado (23505), avisa con un mensaje claro', async () => {
    escenario({
      sgrh_liquidaciones: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe una liquidación guardada para este empleado.',
    })
  })

  it('si falla el guardado por otro motivo, avisa con un mensaje genérico en vez de asumir que ya existía o filtrar el error interno', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    escenario({
      sgrh_liquidaciones: {
        data: null,
        error: { code: '42501', message: 'permission denied for table sgrh_liquidaciones' },
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo guardar la liquidación. Intentá de nuevo o avisá a soporte.',
    })
    consoleErrorSpy.mockRestore()
  })

  it('si se guarda pero no se puede cerrar el expediente, avisa para revisarlo a mano', async () => {
    escenario({
      sgrh_historial_laboral: [
        { data: HISTORIAL, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('NO se cerró')
      expect(result.error).toContain('100')
    }
  })

  // El hallazgo del informe: RLS no devuelve error cuando bloquea un UPDATE.
  // Filtra la fila, se tocan 0 registros y PostgREST responde "todo bien". La
  // liquidación quedaba guardada, el empleado activo, y como
  // liq_historial_laboral_id es UNIQUE ya no se podía reintentar.
  it('detecta el cierre bloqueado por RLS aunque no venga ningún error', async () => {
    escenario({
      sgrh_historial_laboral: [
        { data: HISTORIAL, error: null },
        { data: [], error: null },
      ],
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('sigue apareciendo como activo')
  })

  // Mejor todavía: con un rol sin HISTORIAL_WRITE (el CONTADOR del seed) no se
  // escribe NADA, así no queda el estado a medias que no se puede reintentar.
  it('no escribe nada si el usuario no puede cerrar el expediente', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    escenario()

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('HISTORIAL_WRITE')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  // La antigüedad es la relación laboral con la empresa, no el contrato
  // vigente. Un traslado abre un lab_id nuevo; medir desde ahí le borraba a la
  // persona los años anteriores y le pagaba meses en vez de años.
  it('mide la antigüedad desde el ingreso original, no desde el contrato actual', async () => {
    escenario({
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_historial_laboral: [
        {
          data: {
            ...HISTORIAL,
            // Traslado reciente: el contrato vigente arrancó hace 5 meses.
            lab_fecha_inicio: '2025-08-15',
            sgrh_empleados: { emp_fecha_ingreso_original: '2020-01-15' },
          },
          error: null,
        },
        CERRADO,
      ],
    })

    const result = await procesarLiquidacion({ ...INPUT, motivoSalidaId: 6 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 6 años desde 2020, no 5 meses desde el traslado.
    expect(result.data.diasCesantia).toBe(129)
    expect(result.data.diasPreaviso).toBe(30)
    expect(result.data.advertencias.some((a) => a.includes('ingreso a la empresa'))).toBe(true)
  })

  it('sin fecha de ingreso original usa el contrato y avisa que puede quedar corta', async () => {
    escenario({
      sgrh_historial_laboral: [
        { data: { ...HISTORIAL, sgrh_empleados: null }, error: null },
        CERRADO,
      ],
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.advertencias.some((a) => a.includes('ingreso original'))).toBe(true)
  })
})
