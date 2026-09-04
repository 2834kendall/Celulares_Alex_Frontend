import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPeriodoDetail } from './getPeriodoDetail'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { decryptField } from '@/lib/crypto/fieldCrypto'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
// El cruce con las marcas de asistencia se mockea entero: acá se prueba el
// armado del detalle, no el cálculo de horas (que tiene sus propios tests).
vi.mock('@/modules/payroll/lib/horasPeriodoData', () => ({ getHorasDelPeriodo: vi.fn() }))
// fieldCrypto importa 'server-only', que revienta fuera de Next.js (ver
// planillaExcel.test.ts). El descifrado real vive en fieldCrypto.core.test.ts.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/crypto/fieldCrypto', () => ({ decryptField: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetHorasDelPeriodo = vi.mocked(getHorasDelPeriodo)
const mockDecryptField = vi.mocked(decryptField)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const PERIODO_ROW = {
  npe_id: 7,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-07-01',
  npe_fecha_fin_periodo: '2026-07-15',
  npe_estado: 'borrador',
  npe_fecha_pago: null,
  npe_observaciones: null,
  sgrh_sucursales: { suc_nombre: 'Central' },
}

const DETALLE_ROW = {
  ndt_id: 21,
  ndt_historial_laboral_id: 9,
  ndt_salario_bruto: 500000,
  ndt_total_deducciones_obreras: 52500,
  ndt_total_cargas_patronales: 133000,
  ndt_salario_neto: 447500,
  ndt_pagado: false,
  ndt_fecha_pago: null,
  ndt_horas_ordinarias_diurnas: 88,
  ndt_salario_por_hora: 2500,
  ndt_dias_incapacidad_empleador: 0,
  ndt_dias_incapacidad_ccss: 0,
  sgrh_historial_laboral: {
    lab_salario_base: 500000,
    sgrh_empleados: {
      emp_id: 501,
      emp_nombre: 'Ana',
      emp_apellido_1: 'Mora',
      emp_apellido_2: null,
      emp_numero_identificacion: '1-1111-1111',
    },
  },
}

// tau_porcentaje_pago_empleador solo se usa cuando hay días de incapacidad;
// se incluye igual en todos los mocks porque getPeriodoDetail siempre la
// consulta en paralelo con la planilla.
const TIPO_AUSENCIA_ROW = { data: { tau_porcentaje_pago_empleador: 50 }, error: null }

function mockTables(responses: Record<string, { data: unknown; error: unknown }>) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      // La acción consulta esta tabla en todos los casos; los tests que no la
      // declaran no deberían tener que enumerarla.
      sgrh_comprobantes_pago: { data: [], error: null },
      ...responses,
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getPeriodoDetail (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
    mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map() })
    // Por defecto la cuenta se descifra bien y devuelve lo guardado.
    mockDecryptField.mockImplementation(async (stored) => ({ ok: true, value: stored }))
  })

  it('marca notFound con un id inválido', async () => {
    const result = await getPeriodoDetail(0)

    expect(result).toEqual({ ok: false, error: 'Periodo inválido.', notFound: true })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('marca notFound cuando RLS no devuelve la fila', async () => {
    mockTables({
      sgrh_nomina_periodo: { data: null, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const result = await getPeriodoDetail(7)

    expect(result).toEqual({
      ok: false,
      error: 'El periodo no existe o no es visible.',
      notFound: true,
    })
  })

  it('devuelve error genérico si falla la planilla', async () => {
    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: { data: null, error: { message: 'boom' } },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
    })

    const result = await getPeriodoDetail(7)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar la planilla del periodo.' })
  })

  it('arma el detalle con nombre completo del empleado y los montos crudos', async () => {
    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: { data: [DETALLE_ROW], error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
      sgrh_nomina_linea_ingreso: {
        data: [
          {
            ing_nomina_detalle_id: 21,
            ing_monto: 450000,
            sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' },
          },
          {
            ing_nomina_detalle_id: 21,
            ing_monto: 50000,
            sgrh_cat_conceptos_nomina: { con_codigo: 'COMISION' },
          },
        ],
        error: null,
      },
      sgrh_nomina_linea_deduccion: {
        data: [
          {
            ded_nomina_detalle_id: 21,
            ded_monto: 52500,
            sgrh_cat_conceptos_nomina: {
              con_codigo: 'CCSS_OBRERA',
              con_tipo_calculo: 'porcentaje_deduccion_bruto',
            },
          },
          {
            ded_nomina_detalle_id: 21,
            ded_monto: 10000,
            sgrh_cat_conceptos_nomina: {
              con_codigo: 'PRESTAMO',
              con_tipo_calculo: 'monto_manual_deduccion',
            },
          },
        ],
        error: null,
      },
      sgrh_empleado_datos_pago: {
        data: [
          {
            edp_empleado_id: 501,
            edp_numero_cuenta: 'CR05015202001026284066',
            sgrh_cat_bancos: { ban_nombre: 'Banco Nacional' },
          },
        ],
        error: null,
      },
      sgrh_comprobantes_pago: {
        data: [{ com_nomina_detalle_id: 21, com_codigo_verificacion: 'ABCD-EFGH-JKMN' }],
        error: null,
      },
    })

    const result = await getPeriodoDetail(7)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.sucursalNombre).toBe('Central')
      expect(result.data.detalles).toEqual([
        {
          id: 21,
          historialLaboralId: 9,
          empleadoNombre: 'Ana Mora',
          empleadoCedula: '1-1111-1111',
          salarioBruto: 500000,
          totalDeducciones: 52500,
          deduccionPorcentual: 52500,
          deduccionManual: 10000,
          cargasPatronales: 133000,
          salarioNeto: 447500,
          pagado: false,
          fechaPago: null,
          codigoVerificacion: 'ABCD-EFGH-JKMN',
          diasPorRevisar: [],
          montosPorConcepto: { BASE: 450000, COMISION: 50000, CCSS_OBRERA: 52500, PRESTAMO: 10000 },
          horasTrabajadas: 88,
          horasExtra: 0,
          salarioPorHora: 2500,
          incapacidad: null,
          numeroCuenta: 'CR05015202001026284066',
          bancoNombre: 'Banco Nacional',
          cuentaIlegible: false,
        },
      ])
    }
  })

  it('marca cuentaIlegible cuando la cuenta no se pudo descifrar', async () => {
    mockDecryptField.mockResolvedValue({ ok: false })
    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: { data: [DETALLE_ROW], error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
      sgrh_nomina_linea_ingreso: { data: [], error: null },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
      sgrh_empleado_datos_pago: {
        data: [
          {
            edp_empleado_id: 501,
            edp_numero_cuenta: 'v1:rota:rota',
            sgrh_cat_bancos: { ban_nombre: 'Banco Nacional' },
          },
        ],
        error: null,
      },
    })

    const result = await getPeriodoDetail(7)

    expect(result.ok).toBe(true)
    if (result.ok) {
      // Distinto de "no cargó datos de pago": el empleado SÍ tiene cuenta, y
      // quien arma la transferencia tiene que poder diferenciarlo.
      expect(result.data.detalles[0].numeroCuenta).toBeNull()
      expect(result.data.detalles[0].cuentaIlegible).toBe(true)
    }
  })

  it('deja los montos crudos vacíos si las consultas de líneas fallan (no bloquea la página)', async () => {
    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: { data: [DETALLE_ROW], error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
      sgrh_nomina_linea_ingreso: { data: null, error: { message: 'boom' } },
      sgrh_nomina_linea_deduccion: { data: null, error: { message: 'boom' } },
      sgrh_empleado_datos_pago: { data: null, error: { message: 'boom' } },
    })

    const result = await getPeriodoDetail(7)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.detalles[0].montosPorConcepto).toEqual({})
      // Los datos de pago también son informativos: si la consulta falla, no
      // bloquea la página, simplemente no se muestra la cuenta.
      expect(result.data.detalles[0].numeroCuenta).toBeNull()
      expect(result.data.detalles[0].bancoNombre).toBeNull()
      // Una consulta que falla no es una cuenta ilegible: no hay dato que leer.
      expect(result.data.detalles[0].cuentaIlegible).toBe(false)
    }
  })

  it('arma la incapacidad cuando el detalle tiene días guardados', async () => {
    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: {
        data: [{ ...DETALLE_ROW, ndt_dias_incapacidad_empleador: 3, ndt_dias_incapacidad_ccss: 2 }],
        error: null,
      },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
      sgrh_nomina_linea_ingreso: { data: [], error: null },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
      sgrh_empleado_datos_pago: { data: [], error: null },
    })

    const result = await getPeriodoDetail(7)

    expect(result.ok).toBe(true)
    if (result.ok) {
      // lab_salario_base 500000 / 30 = 16666.67 diario; 3 días × 50% = 25000.005 -> 25000
      expect(result.data.detalles[0].incapacidad).toEqual({
        diasEmpleador: 3,
        diasCcss: 2,
        porcentajePagoEmpleador: 50,
        monto: 25000,
      })
    }
  })
  // El aviso de la pantalla sale de acá; quien realmente bloquea el pago es
  // marcarDetallePagado, que lo vuelve a consultar.
  it('reporta los días con marcas incompletas del empleado', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          9,
          {
            horasEsperadas: 88,
            horasOrdinarias: 80,
            horasExtra: 0,
            diasConProblema: [{ fecha: '2026-07-08', problema: 'sin_salida' as const }],
            dias: [],
          },
        ],
      ]),
    })

    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: { data: [DETALLE_ROW], error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
      sgrh_nomina_linea_ingreso: { data: [], error: null },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
      sgrh_empleado_datos_pago: { data: [], error: null },
    })

    const result = await getPeriodoDetail(7)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.detalles[0].diasPorRevisar).toEqual([
        { fecha: '2026-07-08', problema: 'sin_salida' },
      ])
    }
  })

  it('si la lectura de marcas falla, la planilla se muestra igual', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({ ok: false, error: 'boom' })

    mockTables({
      sgrh_nomina_periodo: { data: PERIODO_ROW, error: null },
      sgrh_nomina_detalle: { data: [DETALLE_ROW], error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA_ROW,
      sgrh_nomina_linea_ingreso: { data: [], error: null },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
      sgrh_empleado_datos_pago: { data: [], error: null },
    })

    const result = await getPeriodoDetail(7)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.detalles[0].diasPorRevisar).toEqual([])
    }
  })
})
