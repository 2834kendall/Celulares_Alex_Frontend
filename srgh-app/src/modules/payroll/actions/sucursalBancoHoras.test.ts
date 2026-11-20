import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { ERROR_OTRA_SUCURSAL } from '@/modules/payroll/lib/sucursalCuenta'
import { getBancoHoras } from './getBancoHoras'
import { pagarBancoHoras } from './pagarBancoHoras'
import { compensarBancoHoras } from './compensarBancoHoras'
import { revertirBancoHoras } from './revertirBancoHoras'
import { SELECT_LIQUIDACION_DEL_MOVIMIENTO } from '@/modules/payroll/lib/bancoHorasLiquidado'

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

describe('getBancoHoras por sucursal de la cuenta', () => {
  const movimiento = (id: number, sucursal: number) => ({
    bhm_id: id,
    bhm_historial_laboral_id: 5,
    bhm_horas: 8,
    bhm_salario_por_hora: 2500,
    bhm_estado: 'pendiente',
    bhm_monto_pagado: null,
    bhm_fecha_resolucion: null,
    bhm_created_at: '2026-07-01T10:00:00',
    sgrh_historial_laboral: { lab_sucursal_id: sucursal, sgrh_empleados: EMPLEADO },
    sgrh_nomina_detalle: {
      sgrh_nomina_periodo: { npe_periodo_mes: 7, npe_periodo_anio: 2026, npe_quincena: 1 },
    },
  })
  const tablas = () => ({
    sgrh_cat_conceptos_nomina: { data: { con_porcentaje: 150 }, error: null },
    sgrh_banco_horas_movimientos: { data: [movimiento(1, SONY), movimiento(2, XBOX)], error: null },
  })

  it('una cuenta de sucursal ve solo el banco de su sucursal', async () => {
    comoSucursal()
    cliente(tablas())

    const result = await getBancoHoras()

    expect(result.ok && result.data.pendientes.map((i) => i.id)).toEqual([1])
  })

  it('una cuenta de toda la empresa ve el de todas', async () => {
    comoEmpresa()
    cliente(tablas())

    const result = await getBancoHoras()

    expect(result.ok && result.data.pendientes.map((i) => i.id)).toEqual([1, 2])
  })
})

describe('resolver un movimiento del banco de horas por sucursal de la cuenta', () => {
  const movimiento = (sucursal: number, estado: string) => ({
    bhm_id: 1,
    bhm_historial_laboral_id: 5,
    bhm_estado: estado,
    bhm_created_at: '2026-07-01T10:00:00',
    sgrh_historial_laboral: { lab_sucursal_id: sucursal },
  })
  const tabla = (sucursal: number, estado: string) => ({
    sgrh_banco_horas_movimientos: { data: movimiento(sucursal, estado), error: null },
  })

  it('pagarBancoHoras rechaza el movimiento de otra sucursal sin escribir', async () => {
    comoSucursal()
    const mock = cliente(tabla(XBOX, 'pendiente'))

    const result = await pagarBancoHoras({ bhmId: 1, monto: 30000 })

    expect(result).toEqual({ ok: false, error: ERROR_OTRA_SUCURSAL })
    expect(escribio(mock, 'sgrh_banco_horas_movimientos')).toBe(false)
  })

  it('pagarBancoHoras con uno de su sucursal sigue con las demás reglas', async () => {
    comoSucursal()
    cliente(tabla(SONY, 'pagado'))

    expect(await pagarBancoHoras({ bhmId: 1, monto: 30000 })).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
  })

  it('compensarBancoHoras rechaza el movimiento de otra sucursal sin escribir', async () => {
    comoSucursal()
    const mock = cliente(tabla(XBOX, 'pendiente'))

    const result = await compensarBancoHoras(1, 'Se dieron como horas libres')

    expect(result).toEqual({ ok: false, error: ERROR_OTRA_SUCURSAL })
    expect(escribio(mock, 'sgrh_banco_horas_movimientos')).toBe(false)
  })

  it('compensarBancoHoras con uno de su sucursal sigue con las demás reglas', async () => {
    comoSucursal()
    cliente(tabla(SONY, 'pagado'))

    expect(await compensarBancoHoras(1, 'Se dieron como horas libres')).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
  })

  it('revertirBancoHoras rechaza el movimiento de otra sucursal sin escribir', async () => {
    comoSucursal()
    const mock = cliente(tabla(XBOX, 'pagado'))

    const result = await revertirBancoHoras(1)

    expect(result).toEqual({ ok: false, error: ERROR_OTRA_SUCURSAL })
    expect(escribio(mock, 'sgrh_banco_horas_movimientos')).toBe(false)
  })

  it('revertirBancoHoras con uno de su sucursal sigue con las demás reglas', async () => {
    comoSucursal()
    cliente(tabla(SONY, 'pendiente'))

    expect(await revertirBancoHoras(1)).toEqual({
      ok: false,
      error: 'Estas horas ya están pendientes en el banco.',
    })
  })

  it('una cuenta de toda la empresa resuelve movimientos de cualquier sucursal', async () => {
    comoEmpresa()
    cliente(tabla(XBOX, 'pagado'))

    expect(await pagarBancoHoras({ bhmId: 1, monto: 30000 })).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
  })
})

// Un mock no sabe si la consulta pide la columna: sin la sucursal en el SELECT,
// el movimiento llega sin ella y la revisión de arriba lo trataría como "sin
// sucursal" (se niega a todas las cuentas de sucursal, o pasa en silencio).
describe('las consultas del banco de horas piden la sucursal del contrato', () => {
  it('el SELECT de pagar y compensar la incluye', () => {
    expect(SELECT_LIQUIDACION_DEL_MOVIMIENTO).toContain('lab_sucursal_id')
  })

  it('revertirBancoHoras la pide del movimiento', async () => {
    comoSucursal()
    const mock = cliente({ sgrh_banco_horas_movimientos: { data: null, error: null } })
    await revertirBancoHoras(1)
    const pedidos = mock.from.mock.results.flatMap(
      (r) => (r.value as { select: { mock: { calls: unknown[][] } } }).select.mock.calls
    )
    expect(pedidos.map((c) => String(c[0])).join()).toContain('lab_sucursal_id')
  })
})
