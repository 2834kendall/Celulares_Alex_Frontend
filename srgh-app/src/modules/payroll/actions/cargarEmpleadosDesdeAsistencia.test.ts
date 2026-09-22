import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cargarEmpleadosDesdeAsistencia } from './cargarEmpleadosDesdeAsistencia'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
// lineasNomina importa 'server-only', que revienta fuera de Next.js.
vi.mock('server-only', () => ({}))

import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/modules/payroll/lib/planillaData', () => ({ getEmpleadosActivos: vi.fn() }))
vi.mock('@/modules/payroll/lib/horasPeriodoData', () => ({ getHorasDelPeriodo: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockEmpleados = vi.mocked(getEmpleadosActivos)
const mockGetHoras = vi.mocked(getHorasDelPeriodo)

const OK = { data: null, error: null }

const PERIODO = {
  npe_id: 9,
  npe_estado: 'borrador',
  npe_sucursal_id: 2,
  npe_periodo_mes: 9,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-09-01',
  npe_fecha_fin_periodo: '2026-09-15',
}

const CONCEPTOS = [
  {
    con_id: 1,
    con_codigo: 'BASE',
    con_tipo: 'ingreso',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 25,
    con_codigo: 'AJUSTE',
    con_tipo: 'ingreso',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_tipo: 'deduccion',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  },
]

function totales(over: Record<string, unknown> = {}) {
  return {
    horasEsperadas: 96,
    horasOrdinarias: 96,
    horasExtra: 0,
    diasConProblema: [],
    diasQueBloquean: [],
    horasAcreditadas: 0,
    diasAcreditadosSinHorario: 0,
    diasJustificados: 0,
    periodoCubiertoPorAusencias: false,
    horasProgramadasTotales: (over.horasEsperadas as number | undefined) ?? 96,
    diasJustificadosSinHorario: 0,
    diasSinProgramar: 0,
    dias: [],
    ...over,
  }
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Periodo vacío al que se le van a cargar los empleados. */
function escenario(
  over: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]> = {}
) {
  return mockSupabase({
    sgrh_nomina_periodo: { data: PERIODO, error: null },
    sgrh_nomina_detalle: [
      // Quiénes ya están en el periodo: nadie.
      { data: [], error: null },
      // El insert devuelve las filas creadas.
      { data: [{ ndt_id: 70, ndt_historial_laboral_id: 5 }], error: null },
    ],
    sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
    sgrh_nomina_linea_ingreso: [OK, OK],
    sgrh_nomina_linea_patronal: { data: null, error: null },
    sgrh_nomina_linea_deduccion: [OK, OK],
    sgrh_banco_horas_movimientos: { data: null, error: null },
    ...over,
  })
}

function llamadas(
  client: ReturnType<typeof mockSupabase>,
  tabla: string,
  metodo: 'insert' | 'update'
) {
  return client.from.mock.results
    .filter((_, i) => client.from.mock.calls[i][0] === tabla)
    .flatMap((r) => {
      const fn = (r.value as Record<string, { mock: { calls: unknown[][] } }>)[metodo]
      return fn.mock.calls.map((args) => args[0])
    })
}

describe('cargarEmpleadosDesdeAsistencia (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 7 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    mockEmpleados.mockResolvedValue({
      ok: true,
      data: [
        {
          labId: 5,
          cedula: '1-1111-2222',
          nombre: 'Ana Pérez',
          salarioBaseMensual: 600000,
          salarioRealMensual: 645000,
          horasSemanales: 48,
        },
      ],
    })
    mockGetHoras.mockResolvedValue({ ok: true, data: new Map([[5, totales()]]) })
  })

  it('rechaza un periodo inválido sin llamar a Supabase', async () => {
    const result = await cargarEmpleadosDesdeAsistencia(0)

    expect(result).toEqual({ ok: false, error: 'Periodo inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('no carga sobre un periodo que ya salió de borrador', async () => {
    escenario({ sgrh_nomina_periodo: { data: { ...PERIODO, npe_estado: 'pagado' }, error: null } })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('borrador')
  })

  it('avisa si la sucursal no tiene empleados activos', async () => {
    escenario()
    mockEmpleados.mockResolvedValue({ ok: true, data: [] })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('contrato activo')
  })

  it('crea la fila con las horas de la asistencia y el base prorrateado', async () => {
    const client = escenario()

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result).toEqual({
      ok: true,
      agregados: 1,
      yaEstaban: 0,
      sinAsistencia: 0,
      sinSalario: [],
    })

    const fila = (
      llamadas(client, 'sgrh_nomina_detalle', 'insert')[0] as Record<string, unknown>[]
    )[0]

    expect(fila).toMatchObject({
      ndt_nomina_periodo_id: 9,
      ndt_historial_laboral_id: 5,
      ndt_horas_ordinarias_diurnas: 96,
      ndt_horas_extra_al_50: 0,
      // Salario real 645000 / 30 / 8
      ndt_salario_por_hora: 2687.5,
      // Horario cumplido: cobra el objetivo, real ÷ 2 = 322.500. La base de la
      // Q1 es 600000 / 30 x 15 = 300.000 y el ajuste, 22.500.
      ndt_salario_bruto: 322500,
      // La foto queda igual a lo guardado: la fila nace "origen asistencia".
      ndt_horas_asistencia: 96,
    })

    // El ajuste se escribe solo, como línea del concepto AJUSTE.
    const lineas = llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert').flat() as Record<
      string,
      unknown
    >[]
    expect(lineas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ing_concepto_id: 1, ing_monto: 300000 }),
        expect.objectContaining({ ing_concepto_id: 25, ing_monto: 22500 }),
      ])
    )
  })

  it('no carga nada si el catálogo no tiene el concepto AJUSTE', async () => {
    const client = escenario({
      sgrh_cat_conceptos_nomina: {
        data: CONCEPTOS.filter((c) => c.con_codigo !== 'AJUSTE'),
        error: null,
      },
    })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('AJUSTE')
    expect(llamadas(client, 'sgrh_nomina_detalle', 'insert')).toHaveLength(0)
  })

  // Media quincena trabajada: cobra la mitad, no el salario entero.
  it('prorratea el base cuando no se cumplió la jornada', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasOrdinarias: 48 })]]),
    })

    await cargarEmpleadosDesdeAsistencia(9)

    const fila = (
      llamadas(client, 'sgrh_nomina_detalle', 'insert')[0] as Record<string, unknown>[]
    )[0]

    expect(fila).toMatchObject({ ndt_horas_ordinarias_diurnas: 48, ndt_salario_bruto: 161250 })
  })

  // Trabajar de más no infla el salario base: esas horas van al banco y se
  // pagan aparte. Si el base subiera, se pagarían dos veces.
  it('las horas extra no inflan el base', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasOrdinarias: 96, horasExtra: 6 })]]),
    })

    await cargarEmpleadosDesdeAsistencia(9)

    const fila = (
      llamadas(client, 'sgrh_nomina_detalle', 'insert')[0] as Record<string, unknown>[]
    )[0]

    expect(fila).toMatchObject({ ndt_salario_bruto: 322500, ndt_horas_extra_al_50: 6 })
  })

  // El caso de un periodo que ya se armó y al que entró alguien nuevo: no se
  // puede rehacer a los que ya están, sus montos pueden estar editados a mano.
  it('solo agrega a los que faltan, sin tocar a los que ya están', async () => {
    const client = escenario({
      sgrh_nomina_detalle: [
        { data: [{ ndt_historial_laboral_id: 5 }], error: null },
        { data: [{ ndt_id: 71, ndt_historial_laboral_id: 6 }], error: null },
      ],
    })
    mockEmpleados.mockResolvedValue({
      ok: true,
      data: [
        {
          labId: 5,
          cedula: '1-1111-2222',
          nombre: 'Ana Pérez',
          salarioBaseMensual: 600000,
          salarioRealMensual: 645000,
          horasSemanales: 48,
        },
        {
          labId: 6,
          cedula: '1-3333-4444',
          nombre: 'Luis Mora',
          salarioBaseMensual: 400000,
          salarioRealMensual: 400000,
          horasSemanales: 48,
        },
      ],
    })
    mockGetHoras.mockResolvedValue({ ok: true, data: new Map([[6, totales()]]) })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result).toEqual({
      ok: true,
      agregados: 1,
      yaEstaban: 1,
      sinAsistencia: 0,
      sinSalario: [],
    })

    const insertadas = llamadas(client, 'sgrh_nomina_detalle', 'insert')[0] as Record<
      string,
      unknown
    >[]
    expect(insertadas).toHaveLength(1)
    expect(insertadas[0]).toMatchObject({ ndt_historial_laboral_id: 6 })
    // Solo se pidió la asistencia de quien falta.
    expect(mockGetHoras).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ historialLaboralIds: [6] })
    )
  })

  it('no escribe nada si ya están todos', async () => {
    const client = escenario({
      sgrh_nomina_detalle: { data: [{ ndt_historial_laboral_id: 5 }], error: null },
    })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result).toEqual({
      ok: true,
      agregados: 0,
      yaEstaban: 1,
      sinAsistencia: 0,
      sinSalario: [],
    })
    expect(llamadas(client, 'sgrh_nomina_detalle', 'insert')).toEqual([])
  })

  // Ojo con el escenario: getHorasDelPeriodo SIEMPRE devuelve una entrada por
  // contrato, aunque sea de ceros. Un empleado sin horario asignado —o un
  // usuario sin permisos de asistencia, donde RLS filtra sin dar error— llega
  // acá con horasEsperadas en 0. Eso NO es "trabajó 0 horas": es que no hay con
  // qué medir. Antes se guardaba esa fila como "0 h trabajadas, salario
  // completo a pagar" y sin ningún aviso.
  // Regla del negocio: sin horas programadas el cumplimiento es 0. La fila se
  // carga en ₡0 (el pago queda trabado hasta revisarla) y se reporta.
  it('a quien no tiene horario lo carga en ₡0, y lo reporta', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 0, horasOrdinarias: 0, horasExtra: 0 })]]),
    })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result).toEqual({
      ok: true,
      agregados: 1,
      yaEstaban: 0,
      sinAsistencia: 1,
      sinSalario: [],
    })

    const fila = (
      llamadas(client, 'sgrh_nomina_detalle', 'insert')[0] as Record<string, unknown>[]
    )[0]
    expect(fila).toMatchObject({ ndt_horas_ordinarias_diurnas: 0, ndt_salario_bruto: 0 })
  })
  // Hallazgo del informe técnico: la base permite dos contratos abiertos para
  // el mismo empleado. Cargar la planilla le armaba una fila por contrato y le
  // pagaba la quincena dos veces, sin aviso: las dos filas son válidas.
  it('no carga la planilla si alguien tiene dos contratos activos', async () => {
    const client = escenario()
    mockEmpleados.mockResolvedValue({
      ok: true,
      data: [
        {
          labId: 5,
          cedula: '1-1111-2222',
          nombre: 'Ana Pérez',
          salarioBaseMensual: 600000,
          salarioRealMensual: 645000,
          horasSemanales: 48,
        },
        {
          // Mismo empleado, contrato viejo sin cerrar.
          labId: 9,
          cedula: '1-1111-2222',
          nombre: 'Ana Pérez',
          salarioBaseMensual: 600000,
          salarioRealMensual: 645000,
          horasSemanales: 48,
        },
      ],
    })

    const result = await cargarEmpleadosDesdeAsistencia(9)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Ana Pérez')
      expect(result.error).toContain('dos veces')
    }
    expect(llamadas(client, 'sgrh_nomina_detalle', 'insert')).toHaveLength(0)
  })
})
