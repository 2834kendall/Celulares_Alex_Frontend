import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPeriodos } from './getPeriodos'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'

vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const PERIODO_BASE = {
  npe_id: 7,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-07-01',
  npe_fecha_fin_periodo: '2026-07-15',
  npe_estado: 'borrador',
  npe_fecha_pago: null,
  npe_sucursal_id: 2,
  sgrh_sucursales: { suc_nombre: 'Central' },
  sgrh_nomina_detalle: [{ count: 4 }],
}

describe('getPeriodos (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('devuelve error genérico si falla la consulta', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_nomina_periodo: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPeriodos()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los periodos de nómina.' })
  })

  it('mapea las filas al view model del listado', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_nomina_periodo: { data: [PERIODO_BASE], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPeriodos()

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: 7,
          mes: 7,
          anio: 2026,
          quincena: 1,
          fechaInicio: '2026-07-01',
          fechaFin: '2026-07-15',
          estado: 'borrador',
          // El periodo termino el 2026-07-15 y sigue en borrador: la accion lo
          // marca como atrasado (derivado, no viene de la base).
          atrasado: true,
          fechaPago: null,
          sucursalNombre: 'Central',
          totalEmpleados: 4,
          puedeEliminar: true,
        },
      ],
    })
  })

  it('tolera sucursal ausente y conteo vacío', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_nomina_periodo: {
          data: [{ ...PERIODO_BASE, sgrh_sucursales: null, sgrh_nomina_detalle: [{ count: 0 }] }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPeriodos()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0].sucursalNombre).toBe('—')
      expect(result.data[0].totalEmpleados).toBe(0)
    }
  })

  // Periodo de toda la empresa: sin sucursal, y solo lo borra una cuenta sin
  // sucursal asignada.
  it('un periodo sin sucursal se rotula "Toda la empresa"', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_nomina_periodo: {
          data: [{ ...PERIODO_BASE, npe_sucursal_id: null, sgrh_sucursales: null }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPeriodos()

    expect(result.ok && result.data[0]).toMatchObject({
      sucursalNombre: 'Toda la empresa',
      puedeEliminar: true,
    })
  })

  it('una cuenta de sucursal no puede eliminar el periodo de la empresa, pero sí uno de su sucursal', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, sucursal_ids: [2] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_nomina_periodo: {
          data: [
            { ...PERIODO_BASE, npe_id: 8, npe_sucursal_id: null, sgrh_sucursales: null },
            PERIODO_BASE,
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPeriodos()

    expect(result.ok && result.data.map((p) => [p.id, p.puedeEliminar])).toEqual([
      [8, false],
      [7, true],
    ])
  })
})

describe('getPeriodos: atraso visto por la cuenta', () => {
  const empresa = (id: number, filas: number) => ({
    ...PERIODO_BASE,
    npe_id: id,
    npe_sucursal_id: null,
    sgrh_sucursales: null,
    sgrh_nomina_detalle: [{ count: filas }],
  })
  const periodos = (claims: Record<string, unknown>) => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: claims,
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        // 8: de toda la empresa, la cuenta no tiene filas · 9: tiene 2 ·
        // 7: de su sucursal, sin filas (un periodo vacío, recién creado).
        sgrh_nomina_periodo: {
          data: [empresa(8, 0), empresa(9, 2), { ...PERIODO_BASE, sgrh_nomina_detalle: [] }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    return getPeriodos()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('una cuenta de sucursal no ve atrasado un periodo de la empresa sin filas suyas', async () => {
    const result = await periodos({ empresa_id: 1, sucursal_ids: [2] })

    expect(result.ok && result.data.map((p) => [p.id, p.atrasado])).toEqual([
      [8, false],
      [9, true],
      [7, true],
    ])
  })

  it('una cuenta de toda la empresa sí lo ve atrasado', async () => {
    const result = await periodos({ empresa_id: 1 })

    expect(result.ok && result.data.map((p) => [p.id, p.atrasado])).toEqual([
      [8, true],
      [9, true],
      [7, true],
    ])
  })
})

const FILTRO_MARCA = { estado: 'filtrado' as const, marcaId: 1, sucursalIds: [5, 6] }
const FILTRO_ERROR = { estado: 'error', sucursalIds: null } as const

describe('getPeriodos con una marca elegida', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  function conPeriodos() {
    const client = createSupabaseClientMock({
      sgrh_nomina_periodo: { data: [PERIODO_BASE], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )
    return client.from.mock.results
  }

  // Los periodos por sucursal, solo los de la marca. Los de toda la empresa
  // salen siempre, contando nada más las filas de la marca.
  it('lee los periodos de sus tiendas y los de toda la empresa, contando solo sus filas', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    const resultados = conPeriodos()

    await getPeriodos()

    expect(resultados[0].value.or).toHaveBeenCalledWith(
      'npe_sucursal_id.is.null,npe_sucursal_id.in.(5,6)'
    )
    expect(resultados[0].value.in).toHaveBeenCalledWith(
      'sgrh_nomina_detalle.ndt_sucursal_id',
      [5, 6]
    )
  })

  it('sin marca no acota', async () => {
    const resultados = conPeriodos()

    await getPeriodos()

    expect(resultados[0].value.in).not.toHaveBeenCalled()
    expect(resultados[0].value.or).not.toHaveBeenCalled()
  })

  it('si no se pudo leer el filtro da error, no todos los periodos', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_ERROR)

    expect((await getPeriodos()).ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
