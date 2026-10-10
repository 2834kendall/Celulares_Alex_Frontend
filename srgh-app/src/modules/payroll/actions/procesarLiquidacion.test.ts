import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { procesarLiquidacion } from './procesarLiquidacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ProcesarLiquidacionInput } from '@/modules/payroll/types'
import { sincronizarPeriodosDeLaSalida } from '@/modules/payroll/lib/estadoPeriodoData'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
// El recálculo del estado del periodo tiene sus propios tests
// (estadoPeriodoData.test.ts); acá solo importa cuándo se llama.
vi.mock('@/modules/payroll/lib/estadoPeriodoData', () => ({
  sincronizarPeriodosDeLaSalida: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockSincronizar = vi.mocked(sincronizarPeriodosDeLaSalida)

/**
 * Ingresó el 15 de enero de 2020 con ₡300.000 al mes. RRHH ya terminó el
 * contrato desde el perfil (SGRH-90): último día el 20 de enero de 2026, 6
 * años y 5 días de antigüedad. La fecha y el motivo salen de acá, no del
 * formulario de liquidación.
 */
const HISTORIAL = {
  lab_id: 1,
  lab_empleado_id: 10,
  lab_fecha_inicio: '2020-01-15',
  lab_fecha_fin: '2026-01-20',
  lab_motivo_salida_id: 5,
  lab_salario_base: 300000,
  lab_salario_real: 300000,
  sgrh_empleados: { emp_fecha_ingreso_original: '2020-01-15' },
  sgrh_liquidaciones: null,
}

// Renuncia sin responsabilidad patronal: no genera cesantía ni preaviso.
const MOTIVO_SIN_DERECHOS = {
  mot_id: 5,
  mot_codigo: 'REN001',
  mot_genera_cesantia: false,
  mot_genera_preaviso: false,
}
// Despido injustificado: genera ambos.
const MOTIVO_CON_DERECHOS = {
  mot_id: 6,
  mot_codigo: 'DES001',
  mot_genera_cesantia: true,
  mot_genera_preaviso: true,
}
// Mutuo acuerdo, tal como está en el catálogo (con cesantía en true): la
// cesantía la decide quien liquida, no el catálogo.
const MOTIVO_MUTUO = {
  mot_id: 4,
  mot_codigo: 'MUT001',
  mot_genera_cesantia: true,
  mot_genera_preaviso: false,
}

/** Solo la CCSS obrera del catálogo, como en el seed. */
const CONCEPTOS_DEDUCCION = [
  { con_tipo: 'deduccion', con_tipo_calculo: 'porcentaje_deduccion_bruto', con_porcentaje: 10.83 },
]

const INPUT: ProcesarLiquidacionInput = {
  historialLaboralId: 1,
  diasVacacionesPendientes: 10,
}

/** registrar_liquidacion devuelve el liq_id guardado. */
const GUARDADA = { data: 100, error: null }

type Respuesta = { data: unknown; error: unknown }

function mockSupabase(
  responses: Record<string, Respuesta | Respuesta[]>,
  registrarLiquidacion: Respuesta = GUARDADA
) {
  const client = createSupabaseClientMock(responses, {
    rpcResponses: { registrar_liquidacion: registrarLiquidacion },
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Una quincena pagada (o no) de la planilla, con su periodo. */
function quincena(anio: number, mes: number, quincena: number, bruto: number, pagado = true) {
  return {
    ndt_historial_laboral_id: 1,
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

/** El aguinaldo del ciclo anterior (2025) ya se pagó en diciembre. */
const PROVISION_2025_PAGADA = {
  data: [{ pra_historial_laboral_id: 1, pra_aguinaldo_pagado: true }],
  error: null,
}

function escenario(
  over: Record<string, Respuesta | Respuesta[]> = {},
  registrarLiquidacion: Respuesta = GUARDADA
) {
  return mockSupabase(
    {
      sgrh_historial_laboral: { data: HISTORIAL, error: null },
      sgrh_cat_motivos_salida: { data: MOTIVO_SIN_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
      sgrh_provisiones_anuales: PROVISION_2025_PAGADA,
      sgrh_pagos_extraordinarios: { data: [], error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS_DEDUCCION, error: null },
      // Sin horas pendientes en el banco de horas.
      sgrh_banco_horas_movimientos: { data: [], error: null },
      ...over,
    },
    registrarLiquidacion
  )
}

/** Los mensajes de advertencia que no son el aviso de vacaciones corregidas. */
function otrasAdvertencias(advertencias: string[]) {
  return advertencias.filter((a) => !a.includes('el sistema proponía'))
}

/** Los argumentos con que se llamó a la RPC registrar_liquidacion. */
function llamadaRpc(client: ReturnType<typeof mockSupabase>) {
  // El mock declara solo el nombre de la función; los argumentos llegan igual.
  const llamada = client.rpc.mock.calls.find((c) => c[0] === 'registrar_liquidacion') as
    unknown[] | undefined
  return llamada?.[1] as { p_lab_id: number; p_liquidacion: Record<string, unknown> }
}

/** Los montos que se mandaron a guardar. */
function insercion(client: ReturnType<typeof mockSupabase>) {
  return llamadaRpc(client).p_liquidacion
}

describe('procesarLiquidacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Sin HISTORIAL_WRITE a propósito: liquidar ya no cierra el contrato.
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE', 'AUSENCIAS_READ'] },
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

  it('rechaza un contrato vigente: primero se termina desde el perfil', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: { ...HISTORIAL, lab_fecha_fin: null }, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Este contrato sigue vigente: primero terminalo desde el perfil del empleado.',
    })
  })

  it('rechaza un contrato que ya fue liquidado', async () => {
    const client = mockSupabase({
      sgrh_historial_laboral: {
        data: { ...HISTORIAL, sgrh_liquidaciones: [{ liq_id: 9 }] },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'Este contrato ya fue liquidado.' })
    expect(client.rpc).not.toHaveBeenCalled()
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
  // La planilla paga real ÷ 2 por quincena (BASE + AJUSTE): sin quincenas
  // para promediar, el diario sale del REAL. Con el base (₡300.000) salía
  // ₡10.000 en vez de ₡11.000 y se liquidaba de menos.
  it('sin quincenas pagadas usa el salario real del contrato, no el base', async () => {
    escenario({
      sgrh_historial_laboral: {
        data: { ...HISTORIAL, lab_salario_base: 300000, lab_salario_real: 330000 },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.salarioDiario).toBe(11000)
    expect(result.data.salarioProporcional).toBe(220000) // 20 días
  })

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

    const result = await procesarLiquidacion(INPUT)

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

  // Riesgo de la auditoría 2: un contrato a plazo fijo roto por el patrono se
  // liquidaba como indefinido. Art. 31 CT (reforma Ley 7983): un día de
  // salario por cada siete trabajados o fracción, mínimo 3 (22 si se pactó
  // por seis meses o más), en vez de preaviso y cesantía.
  describe('contrato a plazo fijo (Art. 31)', () => {
    const PLAZO_FIJO = { ...HISTORIAL, sgrh_cat_tipos_contrato: { tco_codigo: 'PLAZO_FIJO' } }
    const DESPIDO = {
      data: { ...MOTIVO_CON_DERECHOS, mot_nombre: 'Despido con Responsabilidad Patronal' },
      error: null,
    }

    it('despido: indemnización del Art. 31, sin preaviso ni cesantía', async () => {
      const client = escenario({
        sgrh_historial_laboral: { data: PLAZO_FIJO, error: null },
        sgrh_cat_motivos_salida: DESPIDO,
      })

      const result = await procesarLiquidacion({ ...INPUT, plazoSeisMesesOMas: 'si' })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // 15/1/2020 → 20/1/2026 = 2198 días (con los dos extremos) → 2198 ÷ 7 = 314.
      expect(result.data.diasIndemnizacionPlazoFijo).toBe(314)
      expect(result.data.indemnizacionPlazoFijo).toBe(3140000)
      expect(result.data.diasPreaviso).toBe(0)
      expect(result.data.diasCesantia).toBe(0)
      expect(result.data.notaPreaviso).toContain('plazo fijo')
      expect(result.data.notaCesantia).toContain('plazo fijo')
      // No es salario: no cotiza.
      expect(result.data.deduccionesObreras).toBe(32490)
      expect(result.data.advertencias.some((a) => a.includes('Art. 31'))).toBe(true)
      expect(insercion(client)).toMatchObject({
        liq_dias_indemnizacion_plazo_fijo: 314,
        liq_indemnizacion_plazo_fijo: 3140000,
        liq_dias_preaviso: 0,
        liq_dias_cesantia: 0,
      })
    })

    it('el mínimo depende del plazo pactado: 3 días, o 22 con seis meses o más', async () => {
      // Contrato del 1 al 20 de enero de 2026: 20 días → 3 días de salario.
      const corto = { ...PLAZO_FIJO, lab_fecha_inicio: '2026-01-01' }
      escenario({
        sgrh_historial_laboral: { data: corto, error: null },
        sgrh_cat_motivos_salida: DESPIDO,
      })
      const menos = await procesarLiquidacion({ ...INPUT, plazoSeisMesesOMas: 'no' })
      escenario({
        sgrh_historial_laboral: { data: corto, error: null },
        sgrh_cat_motivos_salida: DESPIDO,
      })
      const mas = await procesarLiquidacion({ ...INPUT, plazoSeisMesesOMas: 'si' })

      expect(menos.ok && menos.data.diasIndemnizacionPlazoFijo).toBe(3)
      expect(mas.ok && mas.data.diasIndemnizacionPlazoFijo).toBe(22)
    })

    it('sin decir el plazo pactado no calcula ni guarda nada', async () => {
      const client = escenario({
        sgrh_historial_laboral: { data: PLAZO_FIJO, error: null },
        sgrh_cat_motivos_salida: DESPIDO,
      })

      const result = await procesarLiquidacion(INPUT)

      expect(result).toEqual({
        ok: false,
        error:
          'Es un contrato a plazo fijo terminado por el patrono: indicá si se pactó por seis meses o más.',
      })
      expect(client.rpc).not.toHaveBeenCalled()
    })

    it('fin del plazo o renuncia: sin indemnización y sin preguntar', async () => {
      escenario({
        sgrh_historial_laboral: { data: PLAZO_FIJO, error: null },
        sgrh_cat_motivos_salida: {
          data: { ...MOTIVO_SIN_DERECHOS, mot_nombre: 'Fin de Contrato a Plazo Fijo' },
          error: null,
        },
      })

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.indemnizacionPlazoFijo).toBe(0)
      expect(result.data.notaPreaviso).toBe(
        'no aplica por el motivo de salida (Fin de Contrato a Plazo Fijo)'
      )
    })

    it('un contrato indefinido no cambia', async () => {
      escenario({
        sgrh_historial_laboral: {
          data: { ...HISTORIAL, sgrh_cat_tipos_contrato: { tco_codigo: 'INDEF' } },
          error: null,
        },
        sgrh_cat_motivos_salida: DESPIDO,
      })

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.indemnizacionPlazoFijo).toBe(0)
      expect(result.data.diasPreaviso).toBe(30)
      expect(result.data.notaPreaviso).toBeNull()
    })
  })

  it('usuario de sucursal: no liquida si parte de la relación está en otra que no ve', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {
        permisos: ['NOMINA_WRITE', 'HISTORIAL_WRITE', 'AUSENCIAS_READ'],
        sucursal_ids: [2],
      },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    const anterior = { ...HISTORIAL, lab_id: 9, lab_sucursal_id: 1, lab_fecha_fin: '2025-05-31' }
    const actual = { ...HISTORIAL, lab_sucursal_id: 2, lab_fecha_inicio: '2025-06-01' }
    const client = escenario({
      sgrh_historial_laboral: {
        data: {
          ...actual,
          sgrh_empleados: {
            emp_fecha_ingreso_original: '2020-01-15',
            sgrh_historial_laboral: [
              { ...anterior, sgrh_liquidaciones: null },
              { ...actual, sgrh_liquidaciones: null },
            ],
          },
        },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('sucursal que tu usuario no ve')
    expect(llamadaRpc(client)).toBeUndefined()
  })

  describe('mutuo acuerdo (Art. 86 CT): la cesantía se paga solo si se pactó', () => {
    it('sin decir si se pactó, no calcula ni guarda nada', async () => {
      const client = escenario({ sgrh_cat_motivos_salida: { data: MOTIVO_MUTUO, error: null } })

      const result = await procesarLiquidacion(INPUT)

      expect(result).toEqual({
        ok: false,
        error: 'En una salida por mutuo acuerdo indicá si se pactó pagar cesantía.',
      })
      expect(llamadaRpc(client)).toBeUndefined()
    })

    it('pactada: paga la cesantía de la tabla y no el preaviso', async () => {
      escenario({ sgrh_cat_motivos_salida: { data: MOTIVO_MUTUO, error: null } })

      const result = await procesarLiquidacion({
        ...INPUT,
        cesantiaPactada: 'si',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.diasCesantia).toBe(129)
      expect(result.data.cesantia).toBe(1290000)
      expect(result.data.preaviso).toBe(0)
      expect(result.data.advertencias.some((a) => a.startsWith('Mutuo acuerdo: se pagó'))).toBe(
        true
      )
    })

    it('no pactada: cesantía en 0 aunque el catálogo diga que genera', async () => {
      const client = escenario({ sgrh_cat_motivos_salida: { data: MOTIVO_MUTUO, error: null } })

      const result = await procesarLiquidacion({
        ...INPUT,
        cesantiaPactada: 'no',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.diasCesantia).toBe(0)
      expect(result.data.cesantia).toBe(0)
      expect(insercion(client)).toMatchObject({ liq_cesantia: 0, liq_dias_cesantia: 0 })
      expect(result.data.advertencias.some((a) => a.startsWith('Mutuo acuerdo: no se pagó'))).toBe(
        true
      )
    })

    it('en otro motivo la respuesta se ignora: manda el catálogo', async () => {
      escenario({ sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null } })

      const result = await procesarLiquidacion({
        ...INPUT,
        cesantiaPactada: 'no',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.cesantia).toBe(1290000)
      expect(result.data.advertencias.some((a) => a.startsWith('Mutuo acuerdo'))).toBe(false)
    })
  })

  // El bug que había: seis QUINCENAS (tres meses) divididas entre 30 como si
  // cada una fuera un mes. Daba la mitad del salario diario, y con él la mitad
  // de la cesantía y del preaviso.
  it('promedia los últimos seis meses de quincenas pagadas, no seis quincenas', async () => {
    const client = escenario({
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 12 quincenas de 150.000 = 300.000 al mes → 10.000 diario. Antes daba 5.000.
    expect(result.data.salarioDiario).toBe(10000)
    expect(result.data.preaviso).toBe(300000)
    expect(result.data.cesantia).toBe(1290000)
    expect(otrasAdvertencias(result.data.advertencias)).toEqual([])
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
    const filas = seisMesesPagados(150000).map((q) =>
      q.sgrh_nomina_periodo.npe_periodo_anio === 2025 &&
      q.sgrh_nomina_periodo.npe_periodo_mes === 12 &&
      q.sgrh_nomina_periodo.npe_quincena === 2
        ? { ...q, ndt_pagado: false }
        : q
    )
    const client = escenario({ sgrh_nomina_detalle: { data: filas, error: null } })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const aviso = result.data.advertencias.find((a) => a.includes('sin marcar como pagadas'))
    expect(aviso).toContain('Diciembre 2025 · 2ª quincena')
    // Queda escrito en la liquidación, no solo en el toast.
    expect(insercion(client).liq_observaciones).toContain('Diciembre 2025 · 2ª quincena')
  })

  // Sale el 20 con la 2ª de enero en borrador: esos 5 días los paga la
  // liquidación. Antes el aviso decía "pagala por planilla", o sea pagarlos
  // dos veces.
  it('la quincena de salida sin pagar va en la liquidación, no se manda a planilla', async () => {
    const client = escenario({
      sgrh_nomina_detalle: {
        data: [...seisMesesPagados(150000), quincena(2026, 1, 2, 150000, false)],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.diasSalarioPendiente).toBe(5)
    expect(result.data.advertencias.some((a) => a.includes('sin marcar como pagadas'))).toBe(false)
    const aviso = result.data.advertencias.find((a) => a.includes('van en esta liquidación'))
    expect(aviso).toContain('Enero 2026 · 2ª quincena')
    expect(insercion(client).liq_observaciones).toContain('No se pagan también por planilla')
  })

  // Mes comercial: salir el 28 de febrero es salir a fin de mes. Con la 1ª
  // quincena pagada se deben 15 días (lo que paga la planilla por la 2ª), no 13.
  it('salida el 28 de febrero con la 1ª pagada: 15 días de salario pendiente', async () => {
    const filas = [quincena(2025, 8, 2, 150000)]
    for (const mes of [9, 10, 11, 12]) {
      filas.push(quincena(2025, mes, 1, 150000), quincena(2025, mes, 2, 150000))
    }
    filas.push(quincena(2026, 1, 1, 150000), quincena(2026, 1, 2, 150000))
    filas.push(quincena(2026, 2, 1, 150000), quincena(2026, 2, 2, 150000, false))
    escenario({
      sgrh_historial_laboral: { data: { ...HISTORIAL, lab_fecha_fin: '2026-02-28' }, error: null },
      sgrh_nomina_detalle: { data: filas, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.diasSalarioPendiente).toBe(15)
    // 300.000 / 30 × 15
    expect(result.data.salarioProporcional).toBe(150000)
    const aviso = result.data.advertencias.find((a) => a.includes('van en esta liquidación'))
    expect(aviso).toContain('Febrero 2026 · 2ª quincena')
    expect(aviso).not.toContain('1ª quincena')
  })

  it('con las dos quincenas del mes sin pagar, las dos van en la liquidación', async () => {
    const filas = [
      ...seisMesesPagados(150000).map((q) =>
        q.sgrh_nomina_periodo.npe_periodo_anio === 2026 ? { ...q, ndt_pagado: false } : q
      ),
      quincena(2026, 1, 2, 150000, false),
    ]
    escenario({ sgrh_nomina_detalle: { data: filas, error: null } })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.diasSalarioPendiente).toBe(20)
    const aviso = result.data.advertencias.find((a) => a.includes('van en esta liquidación'))
    expect(aviso).toContain('Enero 2026 · 1ª quincena')
    expect(aviso).toContain('Enero 2026 · 2ª quincena')
    expect(result.data.advertencias.some((a) => a.includes('sin marcar como pagadas'))).toBe(false)
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

  describe('periodo de la quincena de salida', () => {
    const CON_SALIDA_IMPAGA = {
      sgrh_nomina_detalle: {
        data: [...seisMesesPagados(150000), quincena(2026, 1, 2, 150000, false)],
        error: null,
      },
    }

    it('después de guardar, recalcula el periodo de la salida (puede quedar pagado)', async () => {
      const client = escenario(CON_SALIDA_IMPAGA)

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(true)
      expect(mockSincronizar).toHaveBeenCalledTimes(1)
      expect(mockSincronizar).toHaveBeenCalledWith(client, [1], '2026-01-20')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll')
      // Primero se guarda la liquidación, después se recalcula.
      expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        mockSincronizar.mock.invocationCallOrder[0]
      )
    })

    it('sin salario pendiente no hay fila que cubrir: no toca periodos', async () => {
      escenario({
        sgrh_nomina_detalle: {
          data: [...seisMesesPagados(150000), quincena(2026, 1, 2, 150000, true)],
          error: null,
        },
      })

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(true)
      expect(mockSincronizar).not.toHaveBeenCalled()
    })

    it('si la liquidación no se guardó, no toca periodos', async () => {
      escenario(CON_SALIDA_IMPAGA, { data: null, error: { code: 'XX000', message: 'boom' } })

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(false)
      expect(mockSincronizar).not.toHaveBeenCalled()
    })

    it('si el recálculo falla, la liquidación ya guardada se informa como guardada', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      escenario(CON_SALIDA_IMPAGA)
      mockSincronizar.mockRejectedValueOnce(new Error('red caída'))

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll/aguinaldo-liquidacion')
    })
  })

  describe('horas pendientes del banco de horas (auditoría, hallazgo 4)', () => {
    const PENDIENTES = {
      data: [
        { bhm_id: 7, bhm_horas: 5.5, bhm_salario_por_hora: 3200 },
        { bhm_id: 8, bhm_horas: 0.5, bhm_salario_por_hora: 1750 },
      ],
      error: null,
    }

    it('las paga en el finiquito y manda los movimientos a la RPC', async () => {
      const client = escenario({ sgrh_banco_horas_movimientos: PENDIENTES })

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // 5,5 × 3.200 × 1,5 = 26.400 y 0,5 × 1.750 × 1,5 = 1.312,50
      expect(result.data.horasExtraBanco).toBe(27712.5)
      const payload = insercion(client)
      expect(payload).toMatchObject({
        liq_horas_extra_banco: 27712.5,
        banco_horas: [
          { bhm_id: 7, monto: 26400 },
          { bhm_id: 8, monto: 1312.5 },
        ],
      })
      expect(
        result.data.advertencias.some((a) => a.includes('6 h extra que seguían pendientes'))
      ).toBe(true)
      // Solo los pendientes de la relación laboral.
      const banco = client.from.mock.results[
        client.from.mock.calls.findIndex((c) => c[0] === 'sgrh_banco_horas_movimientos')
      ].value as { eq: { mock: { calls: unknown[][] } }; in: { mock: { calls: unknown[][] } } }
      expect(banco.eq.mock.calls).toContainEqual(['bhm_estado', 'pendiente'])
      expect(banco.in.mock.calls[0]).toEqual(['bhm_historial_laboral_id', [1]])
    })

    it('si no puede leer el banco de horas, no liquida', async () => {
      const client = escenario({
        sgrh_banco_horas_movimientos: { data: null, error: { message: 'boom' } },
      })

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok).toBe(false)
      expect(client.rpc).not.toHaveBeenCalled()
    })

    it('sin horas pendientes no agrega nada', async () => {
      const client = escenario()

      const result = await procesarLiquidacion(INPUT)

      expect(result.ok && result.data.horasExtraBanco).toBe(0)
      expect(insercion(client)).toMatchObject({ liq_horas_extra_banco: 0, banco_horas: [] })
    })
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

  it('si ya existe una liquidación para el contrato (23505), avisa con un mensaje claro', async () => {
    escenario({}, { data: null, error: { code: '23505', message: 'duplicate key' } })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe una liquidación guardada para este contrato.',
    })
  })

  // Por ejemplo: RRHH revirtió la terminación mientras contabilidad llenaba el
  // formulario. La RPC lo ve con el contrato bloqueado y lo dice.
  it('muestra el rechazo de la RPC tal cual cuando viene escrito para la UI', async () => {
    escenario(
      {},
      {
        data: null,
        error: {
          code: '23514',
          message: 'Este contrato sigue vigente: primero terminalo desde el perfil del empleado.',
        },
      }
    )

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Este contrato sigue vigente: primero terminalo desde el perfil del empleado.',
    })
  })

  it('si falla el guardado por otro motivo, avisa con un mensaje genérico en vez de filtrar el error interno', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    escenario(
      {},
      { data: null, error: { code: 'XX000', message: 'relation sgrh_x does not exist' } }
    )

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo guardar la liquidación. Intentá de nuevo o avisá a soporte.',
    })
    consoleErrorSpy.mockRestore()
  })

  // Un solo paso atómico: la RPC guarda la liquidación y borra los turnos
  // posteriores a la salida. El contrato, la fecha y el motivo los toma de la
  // fila del contrato, así que no viajan en el payload.
  it('guarda por la RPC con el contrato, sin mandar fecha ni motivo', async () => {
    const client = escenario()

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    const llamada = llamadaRpc(client)
    expect(llamada.p_lab_id).toBe(1)
    expect(llamada.p_liquidacion).not.toHaveProperty('liq_fecha_salida')
    expect(llamada.p_liquidacion).not.toHaveProperty('liq_motivo_salida_id')
    expect(llamada.p_liquidacion).not.toHaveProperty('liq_historial_laboral_id')
    // Ya no hay un UPDATE suelto sobre el contrato.
    expect(client.from).not.toHaveBeenCalledWith('sgrh_liquidaciones')
  })

  it('revalida el perfil del empleado: deja de estar pendiente de liquidar', async () => {
    escenario()

    await procesarLiquidacion(INPUT)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll/aguinaldo-liquidacion')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('usa el motivo que registró RRHH al terminar el contrato', async () => {
    const client = escenario()

    await procesarLiquidacion(INPUT)

    const iMotivo = client.from.mock.calls.findIndex((c) => c[0] === 'sgrh_cat_motivos_salida')
    const consulta = client.from.mock.results[iMotivo].value as {
      eq: { mock: { calls: unknown[][] } }
    }
    expect(consulta.eq.mock.calls).toContainEqual(['mot_id', 5])
  })

  // La antigüedad es la relación laboral con la empresa, no el contrato
  // vigente. Un traslado abre un lab_id nuevo; medir desde ahí le borraba a la
  // persona los años anteriores y le pagaba meses en vez de años.
  it('mide la antigüedad desde el ingreso original, no desde el contrato actual', async () => {
    escenario({
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_historial_laboral: {
        data: {
          ...HISTORIAL,
          // Traslado reciente: el contrato que se liquida arrancó hace 5 meses.
          lab_fecha_inicio: '2025-08-15',
          sgrh_empleados: { emp_fecha_ingreso_original: '2020-01-15' },
        },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 6 años desde 2020, no 5 meses desde el traslado.
    expect(result.data.diasCesantia).toBe(129)
    expect(result.data.diasPreaviso).toBe(30)
    expect(result.data.advertencias.some((a) => a.includes('ingreso a la empresa'))).toBe(true)
  })

  it('sin fecha de ingreso original usa el contrato y avisa que puede quedar corta', async () => {
    escenario({
      sgrh_historial_laboral: { data: { ...HISTORIAL, sgrh_empleados: null }, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.advertencias.some((a) => a.includes('ingreso original'))).toBe(true)
  })

  // ─── Aguinaldo, promedio y vacaciones: reglas del MTSS ─────────────────

  it('sin permiso de leer ausencias no calcula nada (RLS devolvería vacío sin avisar)', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE', 'HISTORIAL_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('AUSENCIAS_READ')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  // La fecha de salida es el último día trabajado: se paga y cuenta. Quien
  // trabajó del 1 de enero al 31 de diciembre tiene un año exacto.
  it('la antigüedad incluye el día de salida: 1 ene → 31 dic es un año', async () => {
    escenario({
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_historial_laboral: {
        data: {
          ...HISTORIAL,
          lab_fecha_inicio: '2025-01-01',
          lab_fecha_fin: '2025-12-31',
          sgrh_empleados: { emp_fecha_ingreso_original: '2025-01-01' },
        },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Antes: 11 meses y 30 días → 15 de preaviso y 14 de cesantía.
    expect(result.data.diasPreaviso).toBe(30)
    expect(result.data.diasCesantia).toBe(19.5)
    expect(result.data.cesantia).toBe(195000)
  })

  it('una quincena con incapacidad sale del promedio y entra la anterior', async () => {
    const filas = seisMesesPagados(150000).map((f) =>
      f.sgrh_nomina_periodo.npe_periodo_mes === 10 && f.sgrh_nomina_periodo.npe_quincena === 1
        ? { ...f, ndt_salario_bruto: 50000 }
        : f
    )
    escenario({
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [quincena(2025, 7, 1, 150000), ...filas], error: null },
      sgrh_ausencias: {
        data: [
          {
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2025-10-03',
            aus_fecha_fin: '2025-10-10',
            sgrh_cat_tipos_ausencia: {
              tau_codigo: 'INC_ENF',
              tau_requiere_documento_ccss: true,
              tau_descuenta_vacaciones: false,
            },
          },
        ],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Sin la regla, la quincena de ₡50.000 bajaba el diario a 9.722,22.
    expect(result.data.salarioDiario).toBe(10000)
    expect(result.data.cesantia).toBe(1290000)
    expect(
      result.data.advertencias.some(
        (a) => a.includes('incapacidad') && a.includes('Octubre 2025 · 1ª quincena')
      )
    ).toBe(true)
  })

  it('la licencia de maternidad cuenta como salario para el aguinaldo y el promedio', async () => {
    // Diciembre 2025 entero en licencia: la planilla pagó ₡0 esas quincenas.
    const filas = seisMesesPagados(150000).map((f) =>
      f.sgrh_nomina_periodo.npe_periodo_mes === 12 ? { ...f, ndt_salario_bruto: 0 } : f
    )
    escenario({
      sgrh_nomina_detalle: { data: filas, error: null },
      sgrh_ausencias: {
        data: [
          {
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2025-12-01',
            aus_fecha_fin: '2025-12-31',
            sgrh_cat_tipos_ausencia: {
              tau_codigo: 'INC_MAT',
              tau_requiere_documento_ccss: true,
              tau_descuenta_vacaciones: false,
            },
          },
        ],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Igual que si hubiera trabajado diciembre: (150.000 × 3 + 50.000) ÷ 12.
    expect(result.data.aguinaldoProporcional).toBe(41666.67)
    expect(result.data.salarioDiario).toBe(10000)
  })

  it('con menos de un mes continuo no hay aguinaldo proporcional, y lo dice', async () => {
    escenario({
      sgrh_historial_laboral: {
        data: {
          ...HISTORIAL,
          lab_fecha_inicio: '2026-01-05',
          sgrh_empleados: { emp_fecha_ingreso_original: '2026-01-05' },
        },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.aguinaldoProporcional).toBe(0)
    expect(result.data.advertencias.some((a) => a.includes('un mes laborado'))).toBe(true)
  })

  it('guarda la propuesta de vacaciones: 1 por mes laborado menos los días tomados', async () => {
    const client = escenario({
      sgrh_ausencias: {
        data: [
          {
            // Lunes 4 al domingo 10 de agosto de 2025: 6 días hábiles.
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2025-08-04',
            aus_fecha_fin: '2025-08-10',
            sgrh_cat_tipos_ausencia: {
              tau_codigo: 'VAC',
              tau_requiere_documento_ccss: false,
              tau_descuenta_vacaciones: true,
            },
          },
        ],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 15 ene 2020 → 20 ene 2026: 72 meses; menos 6 hábiles tomados = 66.
    expect(insercion(client)).toMatchObject({
      liq_dias_vacaciones_propuestos: 66,
      liq_dias_vacaciones_pendientes: 10,
    })
    expect(result.data.advertencias.some((a) => a.includes('el sistema proponía 66'))).toBe(true)
  })

  it('las vacaciones se pagan con el promedio de las últimas 50 semanas (Art. 157)', async () => {
    // 11 quincenas viejas a ₡100.000 y las 12 más recientes a ₡150.000.
    const viejas = [quincena(2025, 1, 2, 100000)]
    for (const mes of [2, 3, 4, 5, 6]) {
      viejas.push(quincena(2025, mes, 1, 100000), quincena(2025, mes, 2, 100000))
    }
    const client = escenario({
      sgrh_nomina_detalle: {
        data: [...viejas, ...seisMesesPagados(150000)],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.salarioDiario).toBe(10000)
    // (12 × 150.000 + 11 × 100.000) ÷ 11,5 meses ÷ 30 = 8.405,80
    expect(result.data.salarioDiarioVacaciones).toBeCloseTo(8405.797, 2)
    expect(result.data.vacacionesPagadas).toBe(84057.97)
    expect(insercion(client).liq_salario_diario_vacaciones).toBeCloseTo(8405.797, 2)
  })

  it('avisa si el aguinaldo del ciclo anterior no consta como pagado, sin sumarlo', async () => {
    const client = escenario({
      sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null },
      sgrh_provisiones_anuales: { data: [], error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const aviso = result.data.advertencias.find((a) =>
      a.includes('aguinaldo 2025 (dic 2024 – nov 2025')
    )
    expect(aviso).toContain('NO está incluido')
    // El proporcional sigue siendo solo el del ciclo 2026.
    expect(result.data.aguinaldoProporcional).toBe(41666.67)
    expect(insercion(client).liq_observaciones).toContain('aguinaldo 2025 (dic 2024 – nov 2025')
  })

  it('un traslado no parte el aguinaldo: suma las quincenas del contrato anterior', async () => {
    const delContratoViejo = [quincena(2025, 12, 1, 150000), quincena(2025, 12, 2, 150000)].map(
      (f) => ({ ...f, ndt_historial_laboral_id: 7 })
    )
    escenario({
      sgrh_historial_laboral: {
        data: {
          ...HISTORIAL,
          lab_fecha_inicio: '2026-01-01',
          sgrh_empleados: {
            emp_fecha_ingreso_original: '2020-01-15',
            sgrh_historial_laboral: [
              {
                lab_id: 7,
                lab_fecha_inicio: '2020-01-15',
                lab_fecha_fin: '2025-12-31',
                lab_salario_base: 300000,
                lab_salario_real: 300000,
                sgrh_liquidaciones: [],
              },
              {
                lab_id: 1,
                lab_fecha_inicio: '2026-01-01',
                lab_fecha_fin: '2026-01-20',
                lab_salario_base: 300000,
                lab_salario_real: 300000,
                sgrh_liquidaciones: [],
              },
            ],
          },
        },
        error: null,
      },
      sgrh_nomina_detalle: {
        data: [...delContratoViejo, quincena(2026, 1, 1, 150000)],
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Dic 2025 (contrato viejo) + ene 2026 Q1 + 5 días pendientes, ÷ 12.
    expect(result.data.aguinaldoProporcional).toBe(41666.67)
  })
})

describe('procesarLiquidacion: vista previa antes de guardar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('soloCalcular devuelve el desglose sin guardar nada', async () => {
    const client = escenario({
      sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null },
    })

    const result = await procesarLiquidacion(INPUT, { soloCalcular: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.liqId).toBeNull()
    expect(result.data.neto).toBeGreaterThan(0)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('la vista previa y lo que se guarda son el mismo cálculo', async () => {
    escenario({ sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null } })
    const previa = await procesarLiquidacion(INPUT, { soloCalcular: true })
    const client = escenario({
      sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null },
    })
    if (!previa.ok) throw new Error(previa.error)

    const guardada = await procesarLiquidacion(INPUT, { netoEsperado: previa.data.neto })

    expect(guardada.ok).toBe(true)
    if (!guardada.ok) return
    expect({ ...guardada.data, liqId: null }).toEqual(previa.data)
    expect(insercion(client).liq_neto).toBe(previa.data.neto)
  })

  it('si el neto cambió desde la vista previa, no guarda y lo dice', async () => {
    const client = escenario({
      sgrh_nomina_detalle: { data: seisMesesPagados(150000), error: null },
    })

    const result = await procesarLiquidacion(INPUT, { netoEsperado: 1 })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Los montos cambiaron desde la vista previa')
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

// Auditoría 2, hallazgo 13: tras un reingreso, la antigüedad no cuenta el
// tiempo de la relación que ya se liquidó.
describe('procesarLiquidacion: antigüedad tras un reingreso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('se mide desde el reingreso, no desde el ingreso original de la ficha', async () => {
    // Trabajó 2020–2024, se liquidó, y volvió el 2 de enero de 2025.
    const anterior = {
      ...HISTORIAL,
      lab_id: 9,
      lab_fecha_inicio: '2020-01-15',
      lab_fecha_fin: '2024-12-31',
      sgrh_liquidaciones: [{ liq_id: 3 }],
    }
    const actual = { ...HISTORIAL, lab_fecha_inicio: '2025-01-02', lab_fecha_fin: '2026-01-20' }
    const client = escenario({
      sgrh_historial_laboral: {
        data: {
          ...actual,
          sgrh_empleados: {
            emp_fecha_ingreso_original: '2020-01-15',
            sgrh_historial_laboral: [anterior, { ...actual, sgrh_liquidaciones: null }],
          },
        },
        error: null,
      },
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 1 año y 18 días: cesantía 19,5 días (fila de 1 año), preaviso 30.
    expect(result.data.diasCesantia).toBe(19.5)
    expect(result.data.diasPreaviso).toBe(30)
    expect(result.data.advertencias.join(' ')).toContain('desde el reingreso (2025-01-02)')
    expect(insercion(client).liq_dias_cesantia).toBe(19.5)
  })
})

// Auditoría 2, fallo 4: pedro tenía ₡14.583,30 del banco de horas pagados a la
// quincena de salida, que la liquidación cubre como salario pendiente: no
// salían ni por planilla ni por el finiquito.
describe('procesarLiquidacion: horas del banco pagadas a una quincena que cubre', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function conAbsorbido(movimientoPagado: unknown) {
    return escenario({
      sgrh_nomina_detalle: {
        data: [...seisMesesPagados(150000), quincena(2026, 1, 2, 150000, false)],
        error: null,
      },
      sgrh_banco_horas_movimientos: [
        { data: [], error: null },
        { data: [movimientoPagado], error: null },
      ],
    })
  }

  const PAGADO_A_LA_CUBIERTA = {
    bhm_id: 70,
    bhm_horas: 5,
    bhm_monto_pagado: 14583.3,
    sgrh_nomina_detalle: {
      ndt_pagado: false,
      sgrh_nomina_periodo: { npe_periodo_anio: 2026, npe_periodo_mes: 1, npe_quincena: 2 },
    },
  }

  it('entran al finiquito con lo que se pagó y se ligan a la liquidación', async () => {
    const client = conAbsorbido(PAGADO_A_LA_CUBIERTA)

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.horasExtraBanco).toBe(14583.3)
    expect(result.data.advertencias.join(' ')).toContain('Enero 2026 · 2ª quincena')
    expect(insercion(client)).toMatchObject({
      liq_horas_extra_banco: 14583.3,
      banco_horas: [{ bhm_id: 70, monto: 14583.3, absorbido: true }],
    })
  })

  it('las pagadas a otra quincena no se tocan', async () => {
    const client = conAbsorbido({
      ...PAGADO_A_LA_CUBIERTA,
      sgrh_nomina_detalle: {
        ndt_pagado: false,
        sgrh_nomina_periodo: { npe_periodo_anio: 2026, npe_periodo_mes: 1, npe_quincena: 1 },
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result.ok && result.data.horasExtraBanco).toBe(0)
    expect(insercion(client)).toMatchObject({ liq_horas_extra_banco: 0, banco_horas: [] })
  })
})
