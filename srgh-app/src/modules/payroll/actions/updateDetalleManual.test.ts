import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateDetalleManual } from './updateDetalleManual'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { EditarDetalleInput } from '@/modules/payroll/types'
import { getFotoAsistencia } from '@/modules/payroll/lib/horasPeriodoData'

// updateDetalleManual.ts llama a sincronizarMovimientoBancoHoras (bancoHorasAccrual.ts),
// que importa 'server-only' — revienta en jsdom si no se mockea (ver planillaExcel.test.ts).
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
// La lectura de marcas tiene sus propios tests. Por defecto el periodo no
// tiene fechas (no hay marcas que leer); el test del ajuste declara una.
vi.mock('@/modules/payroll/lib/horasPeriodoData', () => ({
  getFotoAsistencia: vi.fn(async () => ({ estado: 'sin_fechas' })),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const INPUT: EditarDetalleInput = {
  montos: { BASE: 200000, COMISION: 30000 },
  horasTrabajadas: 80,
  horasExtra: 0,
  salarioPorHora: 2500,
}

const CONCEPTOS_ACTIVOS = [
  { con_id: 1, con_codigo: 'BASE', con_tipo_calculo: 'monto_manual_ingreso', con_porcentaje: null },
  {
    con_id: 3,
    con_codigo: 'COMISION',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 4,
    con_codigo: 'HORAS_EXTRA',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'horas_extra_automatico',
    con_porcentaje: 150,
  },
  {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
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
]

/** Contrato del empleado: el ajuste sale de sus dos salarios. */
const CONTRATO = {
  data: {
    lab_salario_base: 400000,
    lab_salario_real: 430000,
    sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: 48 },
  },
  error: null,
}

const OK = { data: null, error: null }

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock({ sgrh_historial_laboral: CONTRATO, ...responses })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('updateDetalleManual (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un ndtId inválido sin llamar a Supabase', async () => {
    const result = await updateDetalleManual(0, INPUT)

    expect(result).toEqual({ ok: false, error: 'Detalle inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza montos negativos', async () => {
    const result = await updateDetalleManual(1, {
      ...INPUT,
      montos: { ...INPUT.montos, COMISION: -100 },
    })

    expect(result).toEqual({ ok: false, error: 'Datos inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el detalle no existe', async () => {
    mockSupabase({ sgrh_nomina_detalle: { data: null, error: null } })

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({ ok: false, error: 'El detalle no existe o no es visible.' })
  })

  it('rechaza si el periodo ya no está en borrador', async () => {
    mockSupabase({
      sgrh_nomina_detalle: {
        data: {
          ndt_id: 1,
          ndt_nomina_periodo_id: 9,
          ndt_historial_laboral_id: 5,
          sgrh_nomina_periodo: { npe_estado: 'pagado' },
        },
        error: null,
      },
    })

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Solo se puede editar la planilla mientras el periodo está en borrador.',
    })
  })

  it('avisa si no hay conceptos activos en el catálogo', async () => {
    mockSupabase({
      sgrh_nomina_detalle: {
        data: {
          ndt_id: 1,
          ndt_nomina_periodo_id: 9,
          ndt_historial_laboral_id: 5,
          sgrh_nomina_periodo: { npe_estado: 'borrador' },
        },
        error: null,
      },
      sgrh_cat_conceptos_nomina: { data: [], error: null },
    })

    const result = await updateDetalleManual(1, INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Conceptos de nómina')
    }
  })

  it('actualiza los montos y reemplaza las líneas de ingreso y deducción', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        {
          data: {
            ndt_id: 1,
            ndt_nomina_periodo_id: 9,
            ndt_historial_laboral_id: 5,
            sgrh_nomina_periodo: { npe_estado: 'borrador' },
          },
          error: null,
        },
        OK,
      ],
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS_ACTIVOS, error: null },
      sgrh_nomina_linea_ingreso: [OK, OK],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [OK, OK],
      // horasTrabajadas del INPUT (80) no supera el tope (88), así que
      // sincronizarMovimientoBancoHoras solo hace un select (sin movimiento
      // pendiente que borrar).
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({ ok: true })
  })

  it('registra un movimiento pendiente en el banco de horas si se superan las horas normales', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        {
          data: {
            ndt_id: 1,
            ndt_nomina_periodo_id: 9,
            ndt_historial_laboral_id: 5,
            sgrh_nomina_periodo: { npe_estado: 'borrador' },
          },
          error: null,
        },
        OK,
      ],
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS_ACTIVOS, error: null },
      sgrh_nomina_linea_ingreso: [OK, OK],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [OK, OK],
      // Sin movimiento previo (maybeSingle → null) → se inserta uno nuevo.
      sgrh_banco_horas_movimientos: [{ data: null, error: null }, OK],
    })

    const result = await updateDetalleManual(1, { ...INPUT, horasTrabajadas: 92 })

    expect(result).toEqual({ ok: true })
  })

  // Regresion que costaba plata: el formulario solo edita los conceptos
  // ACTIVOS, y al guardar se borran TODAS las lineas para reinsertar lo que
  // devolvio el motor. La linea de HORAS_EXTRA con la que se paga el banco de
  // horas (concepto desactivado a proposito) no tenia como regenerarse, asi
  // que abrir la fila de alguien a quien se le acababa de pagar y darle
  // guardar —sin cambiar nada— le borraba el pago y le bajaba el bruto,
  // mientras el movimiento del banco seguia diciendo "pagado".
  it('conserva las líneas de conceptos desactivados (HORAS_EXTRA del banco)', async () => {
    const HORAS_EXTRA_INACTIVO = {
      con_id: 4,
      con_codigo: 'HORAS_EXTRA',
      con_tipo: 'ingreso',
      con_afecta_salario_bruto: true,
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'horas_extra_automatico',
      con_porcentaje: 150,
    }
    // El catálogo activo NO trae HORAS_EXTRA: está desactivado desde que
    // existe el banco de horas.
    const activos = CONCEPTOS_ACTIVOS.filter((c) => c.con_codigo !== 'HORAS_EXTRA')

    const client = createSupabaseClientMock({
      sgrh_historial_laboral: CONTRATO,
      sgrh_nomina_detalle: [
        {
          data: {
            ndt_id: 1,
            ndt_nomina_periodo_id: 9,
            ndt_historial_laboral_id: 5,
            sgrh_nomina_periodo: { npe_estado: 'borrador' },
          },
          error: null,
        },
        OK,
      ],
      sgrh_cat_conceptos_nomina: { data: activos, error: null },
      sgrh_nomina_linea_ingreso: [
        {
          data: [{ ing_monto: 30000, sgrh_cat_conceptos_nomina: HORAS_EXTRA_INACTIVO }],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({ ok: true })

    const llamadas = (tabla: string, metodo: 'insert' | 'update') =>
      client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === tabla)
        .flatMap((r) => {
          const fn = (r.value as Record<string, { mock: { calls: unknown[][] } }>)[metodo]
          return fn.mock.calls.map((args) => args[0])
        })

    // La línea del banco sigue ahí con su monto...
    expect(
      (llamadas('sgrh_nomina_linea_ingreso', 'insert') as Record<string, unknown>[][]).flat()
    ).toContainEqual(expect.objectContaining({ ing_concepto_id: 4, ing_monto: 30000 }))

    // ...y entra en el bruto: 200000 (BASE) + 30000 (COMISION) + 30000.
    expect(llamadas('sgrh_nomina_detalle', 'update')).toContainEqual(
      expect.objectContaining({ ndt_salario_bruto: 260000 })
    )
  })

  // El ajuste no se digita: lo que venga del formulario se ignora y se
  // recalcula con las horas guardadas y el cumplimiento del horario.
  it('recalcula el ajuste con las horas nuevas e ignora el del formulario', async () => {
    vi.mocked(getFotoAsistencia).mockResolvedValueOnce({
      estado: 'ok',
      datos: new Map([[5, { horas: 96, horasExtra: 0 }]]),
      totales: new Map([
        [
          5,
          {
            horasEsperadas: 96,
            horasOrdinarias: 96,
            horasExtra: 0,
            horasAcreditadas: 0,
            diasAcreditadosSinHorario: 0,
            diasJustificados: 0,
            periodoCubiertoPorAusencias: false,
            horasProgramadasTotales: 96,
            diasJustificadosSinHorario: 0,
            diasSinProgramar: 0,
            diasConProblema: [],
            diasQueBloquean: [],
            dias: [],
          },
        ],
      ]),
    })
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        {
          data: {
            ndt_id: 1,
            ndt_nomina_periodo_id: 9,
            ndt_historial_laboral_id: 5,
            ndt_horas_ordinarias_diurnas: 96,
            ndt_horas_extra_al_50: 0,
            ndt_horas_asistencia: 96,
            ndt_horas_extra_asistencia: 0,
            sgrh_nomina_periodo: {
              npe_estado: 'borrador',
              npe_periodo_mes: 8,
              npe_periodo_anio: 2026,
              npe_quincena: 1,
              npe_fecha_inicio_periodo: '2026-08-01',
              npe_fecha_fin_periodo: '2026-08-15',
            },
          },
          error: null,
        },
        OK,
      ],
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS_ACTIVOS, error: null },
      sgrh_nomina_linea_ingreso: [{ data: [], error: null }, OK, OK],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })

    // Horas cortas (48 de 96) y un ajuste escrito a mano que no debe entrar.
    const result = await updateDetalleManual(1, {
      montos: { BASE: 100000, COMISION: 0, AJUSTE: 99999 },
      horasTrabajadas: 48,
      horasExtra: 0,
      salarioPorHora: 1791.67,
    })

    expect(result).toEqual({ ok: true })
    const insertadas = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_linea_ingreso')
      .flatMap((r) =>
        (r.value as { insert: { mock: { calls: unknown[][] } } }).insert.mock.calls.map((a) => a[0])
      )
      .flat()
    // 48 de 96 h en la Q1: objetivo 215.000 × 0,5 = 107.500; base 200.000 × 0,5
    // = 100.000; ajuste 7.500.
    expect(insertadas).toContainEqual(
      expect.objectContaining({ ing_concepto_id: 25, ing_monto: 7500 })
    )
    expect(insertadas).not.toContainEqual(expect.objectContaining({ ing_monto: 99999 }))
  })
})
