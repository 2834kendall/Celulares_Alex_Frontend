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

  it('lee solo los periodos de sus tiendas', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    const resultados = conPeriodos()

    await getPeriodos()

    expect(resultados[0].value.in).toHaveBeenCalledWith('npe_sucursal_id', [5, 6])
  })

  it('sin marca no acota', async () => {
    const resultados = conPeriodos()

    await getPeriodos()

    expect(resultados[0].value.in).not.toHaveBeenCalled()
  })

  it('si no se pudo leer el filtro da error, no todos los periodos', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_ERROR)

    expect((await getPeriodos()).ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
