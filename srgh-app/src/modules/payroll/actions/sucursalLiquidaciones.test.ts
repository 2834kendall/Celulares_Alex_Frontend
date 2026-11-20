import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { ERROR_OTRA_SUCURSAL } from '@/modules/payroll/lib/sucursalCuenta'
import { getLiquidaciones } from './getLiquidaciones'
import { getContratosPorLiquidar } from './getContratosPorLiquidar'
import { getPagoExtraordinario } from './getPagoExtraordinario'
import { buscarComprobante } from './buscarComprobante'
import { pagarLiquidacion } from './pagarLiquidacion'
import { procesarLiquidacion } from './procesarLiquidacion'
import { proponerVacacionesLiquidacion } from './proponerVacacionesLiquidacion'
import { SELECT_HISTORIAL_LIQUIDACION } from '@/modules/payroll/lib/liquidacionData'

/**
 * Liquidaciones, sus pagos y el banco de horas se leen por EMPRESA en la base
 * (RLS), así que la sucursal del contrato se aplica en la aplicación. Estas
 * pruebas usan dos cuentas como las de la base de prueba: una de sucursal
 * (solo la 1, Sony) y una de toda la empresa, contra registros de la sucursal
 * 1 y de la 11 (Xbox).
 */

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))
vi.mock('@/modules/payroll/lib/envioComprobante', () => ({
  enviarComprobanteExtraordinarioPorCorreo: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
type Claims = Awaited<ReturnType<typeof requirePermission>>
type Cliente = Awaited<ReturnType<typeof createClient>>
type Respuesta = { data: unknown; error: unknown }

const SONY = 1
const XBOX = 11

function comoCuenta(sucursalIds: number[] | null) {
  mockRequirePermission.mockResolvedValue({
    app_metadata: {
      permisos: [PERMISOS.AUSENCIAS_READ],
      ...(sucursalIds ? { sucursal_ids: sucursalIds } : {}),
    },
  } as unknown as Claims)
}
const comoSucursal = () => comoCuenta([SONY])
const comoEmpresa = () => comoCuenta(null)

function cliente(tablas: Record<string, Respuesta | Respuesta[]>) {
  const mock = createSupabaseClientMock(tablas)
  mockCreateClient.mockResolvedValue(mock as unknown as Cliente)
  return mock
}

/** Los .in() que recibió la consulta a esa tabla. */
function filtrosIn(mock: ReturnType<typeof createSupabaseClientMock>, tabla: string) {
  return mock.from.mock.calls.flatMap(([t], i) =>
    t === tabla
      ? (mock.from.mock.results[i].value as { in: { mock: { calls: unknown[][] } } }).in.mock.calls
      : []
  )
}

function escribio(mock: ReturnType<typeof createSupabaseClientMock>, tabla: string) {
  return mock.from.mock.calls.some(([t], i) => {
    if (t !== tabla) return false
    const b = mock.from.mock.results[i].value as Record<string, { mock: { calls: unknown[][] } }>
    return ['insert', 'update', 'upsert', 'delete'].some((m) => b[m].mock.calls.length > 0)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

const EMPLEADO = {
  emp_nombre: 'Ana',
  emp_apellido_1: 'Mora',
  emp_apellido_2: null,
  emp_numero_identificacion: '1-1111-1111',
}

describe('getLiquidaciones por sucursal de la cuenta', () => {
  const liquidacion = (id: number, sucursal: number) => ({
    liq_id: id,
    liq_fecha_salida: '2026-06-30',
    liq_total: 1,
    liq_neto: 1,
    liq_pagado: false,
    liq_fecha_pago: null,
    liq_created_at: '2026-06-30T10:00:00',
    sgrh_pagos_extraordinarios: [],
    sgrh_cat_motivos_salida: null,
    sgrh_historial_laboral: { lab_sucursal_id: sucursal, sgrh_empleados: EMPLEADO },
  })
  const filas = [liquidacion(1, SONY), liquidacion(2, XBOX)]
  const tablas = () => ({
    sgrh_liquidaciones: { data: filas, error: null },
    sgrh_empresas: { data: { org_horas_anular_pago: 48 }, error: null },
  })

  it('una cuenta de sucursal ve solo las liquidaciones de su sucursal', async () => {
    comoSucursal()
    cliente(tablas())

    const result = await getLiquidaciones()

    expect(result.ok && result.data.map((l) => l.liqId)).toEqual([1])
  })

  it('una cuenta de toda la empresa ve las de todas', async () => {
    comoEmpresa()
    cliente(tablas())

    const result = await getLiquidaciones()

    expect(result.ok && result.data.map((l) => l.liqId)).toEqual([1, 2])
  })
})

describe('getContratosPorLiquidar por sucursal de la cuenta', () => {
  it('una cuenta de sucursal pide solo los contratos de sus sucursales', async () => {
    comoSucursal()
    const mock = cliente({ sgrh_historial_laboral: { data: [], error: null } })

    const result = await getContratosPorLiquidar()

    expect(result).toEqual({ ok: true, data: [] })
    expect(filtrosIn(mock, 'sgrh_historial_laboral')).toContainEqual(['lab_sucursal_id', [SONY]])
  })

  it('una cuenta de toda la empresa no limita por sucursal', async () => {
    comoEmpresa()
    const mock = cliente({ sgrh_historial_laboral: { data: [], error: null } })

    await getContratosPorLiquidar()

    expect(filtrosIn(mock, 'sgrh_historial_laboral')).toEqual([])
  })
})

describe('getPagoExtraordinario por sucursal de la cuenta', () => {
  const pago = (sucursal: number) => ({
    pex_id: 31,
    pex_tipo: 'liquidacion',
    pex_anio_aguinaldo: null,
    pex_liquidacion_id: 100,
    pex_monto_bruto: 10,
    pex_deducciones: 1,
    pex_monto_neto: 9,
    pex_lineas: [],
    pex_fecha_pago: '2026-07-01',
    pex_codigo_verificacion: 'ABCDEFGHJKMN',
    pex_observaciones: null,
    pex_anulado_en: null,
    sgrh_historial_laboral: { lab_sucursal_id: sucursal, sgrh_empleados: EMPLEADO },
    sgrh_liquidaciones: null,
  })

  it('el pago de otra sucursal sale como si no existiera', async () => {
    comoSucursal()
    cliente({ sgrh_pagos_extraordinarios: { data: pago(XBOX), error: null } })

    expect(await getPagoExtraordinario(31)).toEqual({
      ok: false,
      error: 'El pago no existe o no es visible.',
    })
  })

  it('el pago de su sucursal se ve', async () => {
    comoSucursal()
    cliente({ sgrh_pagos_extraordinarios: { data: pago(SONY), error: null } })

    const result = await getPagoExtraordinario(31)

    expect(result.ok && result.data.empleadoNombre).toBe('Ana Mora')
  })

  it('una cuenta de toda la empresa ve el de cualquier sucursal', async () => {
    comoEmpresa()
    cliente({ sgrh_pagos_extraordinarios: { data: pago(XBOX), error: null } })

    expect((await getPagoExtraordinario(31)).ok).toBe(true)
  })
})

describe('buscarComprobante de aguinaldo o liquidación por sucursal de la cuenta', () => {
  const CODIGO = 'ABCD-EFGH-JKMN'
  const tablas = (sucursal: number) => ({
    sgrh_comprobantes_pago: { data: null, error: null },
    sgrh_pagos_extraordinarios: {
      data: { pex_id: 31, sgrh_historial_laboral: { lab_sucursal_id: sucursal } },
      error: null,
    },
  })

  it('el código de otra sucursal no lleva al comprobante', async () => {
    comoSucursal()
    cliente(tablas(XBOX))

    const result = await buscarComprobante(CODIGO)

    expect(result.ok).toBe(false)
  })

  it('el código de su sucursal lleva al comprobante', async () => {
    comoSucursal()
    cliente(tablas(SONY))

    expect(await buscarComprobante(CODIGO)).toEqual({
      ok: true,
      href: '/comprobante/extraordinario/31',
    })
  })

  it('una cuenta de toda la empresa encuentra el de cualquier sucursal', async () => {
    comoEmpresa()
    cliente(tablas(XBOX))

    expect((await buscarComprobante(CODIGO)).ok).toBe(true)
  })
})

describe('pagarLiquidacion por sucursal de la cuenta', () => {
  const liquidacion = (sucursal: number, pagada = false) => ({
    liq_id: 100,
    liq_historial_laboral_id: 1,
    liq_pagado: pagada,
    sgrh_historial_laboral: { lab_sucursal_id: sucursal },
  })

  it('no paga la liquidación de otra sucursal ni escribe nada', async () => {
    comoSucursal()
    const mock = cliente({ sgrh_liquidaciones: { data: liquidacion(XBOX), error: null } })

    const result = await pagarLiquidacion(100)

    expect(result).toEqual({ ok: false, error: ERROR_OTRA_SUCURSAL })
    expect(escribio(mock, 'sgrh_pagos_extraordinarios')).toBe(false)
    expect(escribio(mock, 'sgrh_liquidaciones')).toBe(false)
  })

  it('la de su sucursal pasa el control (sigue con las demás reglas)', async () => {
    comoSucursal()
    cliente({
      sgrh_liquidaciones: { data: liquidacion(SONY, true), error: null },
      sgrh_pagos_extraordinarios: { data: [{ pex_id: 7 }], error: null },
    })

    expect(await pagarLiquidacion(100)).toEqual({
      ok: false,
      error: 'Esta liquidación ya estaba pagada.',
    })
  })

  it('una cuenta de toda la empresa puede pagar la de cualquier sucursal', async () => {
    comoEmpresa()
    cliente({
      sgrh_liquidaciones: { data: liquidacion(XBOX, true), error: null },
      sgrh_pagos_extraordinarios: { data: [{ pex_id: 7 }], error: null },
    })

    expect(await pagarLiquidacion(100)).toEqual({
      ok: false,
      error: 'Esta liquidación ya estaba pagada.',
    })
  })
})

describe('liquidar un contrato por sucursal de la cuenta', () => {
  const contrato = (sucursal: number) => ({
    lab_id: 9,
    lab_sucursal_id: sucursal,
    lab_fecha_fin: null,
    lab_motivo_salida_id: null,
    sgrh_liquidaciones: [],
  })
  const entrada = { historialLaboralId: 9, diasVacacionesPendientes: 0 }

  it('procesarLiquidacion rechaza el contrato de otra sucursal', async () => {
    comoSucursal()
    cliente({ sgrh_historial_laboral: { data: contrato(XBOX), error: null } })

    expect(await procesarLiquidacion(entrada)).toEqual({ ok: false, error: ERROR_OTRA_SUCURSAL })
  })

  it('procesarLiquidacion con un contrato de su sucursal llega a las reglas siguientes', async () => {
    comoSucursal()
    cliente({ sgrh_historial_laboral: { data: contrato(SONY), error: null } })

    const result = await procesarLiquidacion(entrada)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).not.toBe(ERROR_OTRA_SUCURSAL)
  })

  it('proponerVacacionesLiquidacion rechaza el contrato de otra sucursal', async () => {
    comoSucursal()
    cliente({ sgrh_historial_laboral: { data: contrato(XBOX), error: null } })

    expect(await proponerVacacionesLiquidacion(9)).toEqual({
      ok: false,
      error: ERROR_OTRA_SUCURSAL,
    })
  })

  it('proponerVacacionesLiquidacion con un contrato de su sucursal llega a las reglas siguientes', async () => {
    comoSucursal()
    cliente({ sgrh_historial_laboral: { data: contrato(SONY), error: null } })

    const result = await proponerVacacionesLiquidacion(9)

    expect(!result.ok && result.error).not.toBe(ERROR_OTRA_SUCURSAL)
  })
})

// Un mock no sabe si la consulta pide la columna: sin la sucursal en el SELECT,
// el registro llega sin ella y la revisión de arriba lo trataría como "sin
// sucursal" (se niega a todas las cuentas de sucursal, o pasa en silencio).
describe('las consultas de liquidaciones piden la sucursal del contrato', () => {
  /** Los select() que recibió la consulta a esa tabla. */
  function selects(mock: ReturnType<typeof createSupabaseClientMock>, tabla: string) {
    return mock.from.mock.calls.flatMap(([t], i) =>
      t === tabla
        ? (
            mock.from.mock.results[i].value as { select: { mock: { calls: unknown[][] } } }
          ).select.mock.calls.map((c) => String(c[0]))
        : []
    )
  }

  it('el SELECT del contrato a liquidar la incluye', () => {
    // Del contrato mismo, no de los contratos anidados de la relación.
    expect(SELECT_HISTORIAL_LIQUIDACION.split('sgrh_cat_tipos_contrato')[0]).toContain(
      'lab_sucursal_id'
    )
  })

  it('pagarLiquidacion la pide de la liquidación', async () => {
    comoSucursal()
    const mock = cliente({ sgrh_liquidaciones: { data: null, error: null } })
    await pagarLiquidacion(100)
    expect(selects(mock, 'sgrh_liquidaciones').join()).toContain('lab_sucursal_id')
  })

  it('getPagoExtraordinario la pide del pago', async () => {
    comoSucursal()
    const mock = cliente({ sgrh_pagos_extraordinarios: { data: null, error: null } })
    await getPagoExtraordinario(31)
    expect(selects(mock, 'sgrh_pagos_extraordinarios').join()).toContain('lab_sucursal_id')
  })

  it('buscarComprobante la pide del pago de aguinaldo o liquidación', async () => {
    comoSucursal()
    const mock = cliente({
      sgrh_comprobantes_pago: { data: null, error: null },
      sgrh_pagos_extraordinarios: { data: null, error: null },
    })
    await buscarComprobante('ABCD-EFGH-JKMN')
    expect(selects(mock, 'sgrh_pagos_extraordinarios').join()).toContain('lab_sucursal_id')
  })
})
