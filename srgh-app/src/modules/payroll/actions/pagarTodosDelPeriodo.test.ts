import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pagarTodosDelPeriodo } from './pagarTodosDelPeriodo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { marcarDetallePagado } from '@/modules/payroll/actions/marcarDetallePagado'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'error de marca',
  getFiltroMarca: vi.fn(),
}))
// Cada fila pasa por el pago individual: sus reglas tienen sus propios tests.
vi.mock('@/modules/payroll/actions/marcarDetallePagado', () => ({ marcarDetallePagado: vi.fn() }))
vi.mock('@/modules/payroll/lib/estadoPeriodoData', () => ({ sincronizarEstadoPeriodo: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockMarcar = vi.mocked(marcarDetallePagado)
const mockSincronizar = vi.mocked(sincronizarEstadoPeriodo)
const mockFiltro = vi.mocked(getFiltroMarca)

const PERIODO = {
  npe_id: 7,
  npe_sucursal_id: null,
  npe_periodo_anio: 2026,
  npe_periodo_mes: 10,
  npe_quincena: 2,
}

const pendiente = (ndt: number, lab: number, sucursal: number, nombre: string) => ({
  ndt_id: ndt,
  ndt_historial_laboral_id: lab,
  ndt_sucursal_id: sucursal,
  sgrh_historial_laboral: {
    sgrh_empleados: { emp_nombre: nombre, emp_apellido_1: 'Prueba', emp_apellido_2: null },
  },
})

const FILAS = [pendiente(1, 11, 2, 'Ana'), pendiente(2, 12, 2, 'Luis'), pendiente(3, 13, 5, 'Eva')]

function cliente(over: Record<string, { data: unknown; error: unknown }> = {}) {
  const client = createSupabaseClientMock({
    sgrh_nomina_periodo: { data: PERIODO, error: null },
    sgrh_nomina_detalle: { data: FILAS, error: null },
    // Nadie liquidado (liquidacionesQueCubren).
    sgrh_historial_laboral: { data: [], error: null },
    sgrh_liquidaciones: { data: [], error: null },
    ...over,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('pagarTodosDelPeriodo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
    mockFiltro.mockResolvedValue({ estado: 'sin-filtro', sucursalIds: null })
    mockMarcar.mockResolvedValue({ ok: true, correo: { estado: 'enviado', email: 'x@y.cr' } })
  })

  it('rechaza ids inválidos sin tocar la base', async () => {
    expect(await pagarTodosDelPeriodo(0)).toEqual({ ok: false, error: 'Periodo inválido.' })
    expect(await pagarTodosDelPeriodo(7, -1)).toEqual({ ok: false, error: 'Sucursal inválida.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('paga cada fila sin pagar por el pago individual y recalcula el periodo al final', async () => {
    const client = cliente()

    const result = await pagarTodosDelPeriodo(7)

    expect(result).toEqual({
      ok: true,
      pagados: 3,
      noPagados: [],
      enLiquidacion: 0,
      correosNoEnviados: 0,
    })
    expect(mockMarcar.mock.calls.map((c) => c).sort()).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ])
    // Solo las que siguen sin pagar.
    const consulta = client.from.mock.results[1].value as { eq: ReturnType<typeof vi.fn> }
    expect(consulta.eq.mock.calls).toContainEqual(['ndt_pagado', false])
    expect(mockSincronizar).toHaveBeenCalledWith(expect.anything(), 7)
  })

  it('una fila que no pasa sus revisiones no frena a las demás y vuelve con su motivo', async () => {
    cliente()
    mockMarcar.mockImplementation(async (id) =>
      id === 2
        ? { ok: false, error: 'Tiene marcas incompletas.' }
        : { ok: true, correo: { estado: 'error', error: 'smtp' } }
    )

    const result = await pagarTodosDelPeriodo(7)

    expect(result).toEqual({
      ok: true,
      pagados: 2,
      noPagados: [{ nombre: 'Luis Prueba', motivo: 'Tiene marcas incompletas.' }],
      enLiquidacion: 0,
      correosNoEnviados: 2,
    })
  })

  it('un error inesperado en una fila se reporta como no pagada', async () => {
    cliente()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockMarcar.mockImplementation(async (id) => {
      if (id === 3) throw new Error('red')
      return { ok: true }
    })

    const result = await pagarTodosDelPeriodo(7)

    expect(result.ok && result.noPagados).toEqual([
      { nombre: 'Eva Prueba', motivo: 'Ocurrió un error inesperado al pagar esta fila.' },
    ])
  })

  it('con el filtro de sucursal de la pantalla, solo esa sucursal', async () => {
    cliente()

    await pagarTodosDelPeriodo(7, 5)

    expect(mockMarcar.mock.calls).toEqual([[3, true]])
  })

  it('con una marca elegida, solo las filas de esa marca', async () => {
    cliente()
    mockFiltro.mockResolvedValue({ estado: 'filtrado', marcaId: 1, sucursalIds: [2] })

    await pagarTodosDelPeriodo(7)

    expect(mockMarcar.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2])
  })

  it('si no se pudo leer la marca, no paga nada', async () => {
    cliente()
    mockFiltro.mockResolvedValue({ estado: 'error', sucursalIds: null })

    expect(await pagarTodosDelPeriodo(7)).toEqual({ ok: false, error: 'error de marca' })
    expect(mockMarcar).not.toHaveBeenCalled()
  })

  it('en un periodo de una sucursal no mira la marca', async () => {
    cliente({ sgrh_nomina_periodo: { data: { ...PERIODO, npe_sucursal_id: 2 }, error: null } })

    await pagarTodosDelPeriodo(7)

    expect(mockFiltro).not.toHaveBeenCalled()
    expect(mockMarcar).toHaveBeenCalledTimes(3)
  })

  // Su salario ya va en una liquidación: no se paga por planilla.
  it('las filas que paga una liquidación no se intentan y se cuentan aparte', async () => {
    cliente({
      sgrh_historial_laboral: {
        data: [{ lab_id: 13, lab_empleado_id: 1, lab_fecha_inicio: '2020-01-01' }],
        error: null,
      },
      sgrh_liquidaciones: {
        data: [
          {
            liq_id: 4,
            liq_historial_laboral_id: 13,
            liq_fecha_salida: '2026-10-20',
            liq_dias_trabajados_mes: 20,
            sgrh_historial_laboral: { lab_empleado_id: 1 },
          },
        ],
        error: null,
      },
    })

    const result = await pagarTodosDelPeriodo(7)

    expect(result).toMatchObject({ ok: true, pagados: 2, enLiquidacion: 1 })
    expect(mockMarcar.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2])
  })

  it('sin pendientes no paga ni recalcula nada', async () => {
    cliente({ sgrh_nomina_detalle: { data: [], error: null } })

    expect(await pagarTodosDelPeriodo(7)).toEqual({
      ok: true,
      pagados: 0,
      noPagados: [],
      enLiquidacion: 0,
      correosNoEnviados: 0,
    })
    expect(mockSincronizar).not.toHaveBeenCalled()
  })

  it('periodo que no existe o planilla ilegible: error', async () => {
    cliente({ sgrh_nomina_periodo: { data: null, error: null } })
    expect(await pagarTodosDelPeriodo(7)).toEqual({
      ok: false,
      error: 'El periodo no existe o no es visible.',
    })

    cliente({ sgrh_nomina_detalle: { data: null, error: { message: 'boom' } } })
    expect(await pagarTodosDelPeriodo(7)).toEqual({
      ok: false,
      error: 'No se pudo cargar la planilla del periodo.',
    })
    expect(mockMarcar).not.toHaveBeenCalled()
  })
})
