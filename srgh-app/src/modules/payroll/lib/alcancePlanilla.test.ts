import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createClient } from '@/lib/supabase/server'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import {
  alcanceDelPeriodo,
  esCuentaDeEmpresa,
  etiquetasDeSucursales,
  leerNominaPorEmpresa,
  periodoFusionadoEn,
  sucursalesDeLaCuenta,
} from './alcancePlanilla'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'error de marca',
  getFiltroMarca: vi.fn(),
}))

type Cliente = Awaited<ReturnType<typeof createClient>>
const mockFiltro = vi.mocked(getFiltroMarca)

const claims = (sucursalIds?: number[]) => ({
  app_metadata: { empresa_id: 1, ...(sucursalIds ? { sucursal_ids: sucursalIds } : {}) },
})

describe('alcanceDelPeriodo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFiltro.mockResolvedValue({ estado: 'sin-filtro', sucursalIds: null })
  })

  it('un periodo con sucursal: esa sucursal, sin consultar nada', async () => {
    const supabase = createSupabaseClientMock({})

    const r = await alcanceDelPeriodo(supabase as unknown as Cliente, claims([9]), 4)

    expect(r).toEqual({ ok: true, porEmpresa: false, sucursalIds: [4] })
    expect(supabase.from).not.toHaveBeenCalled()
    expect(mockFiltro).not.toHaveBeenCalled()
  })

  it('periodo de la empresa: las sucursales que ve la cuenta', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 5 }, { suc_id: 2 }], error: null },
    })

    const r = await alcanceDelPeriodo(supabase as unknown as Cliente, claims([2, 5]), null)

    expect(r).toEqual({ ok: true, porEmpresa: true, sucursalIds: [2, 5] })
    const consulta = supabase.from.mock.results[0].value as {
      eq: ReturnType<typeof vi.fn>
      in: ReturnType<typeof vi.fn>
    }
    expect(consulta.eq).toHaveBeenCalledWith('suc_empresa_id', 1)
    expect(consulta.in).toHaveBeenCalledWith('suc_id', [2, 5])
  })

  it('una cuenta de toda la empresa no filtra por sucursal', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 1 }, { suc_id: 2 }], error: null },
    })

    await alcanceDelPeriodo(supabase as unknown as Cliente, claims(), null)

    const consulta = supabase.from.mock.results[0].value as { in: ReturnType<typeof vi.fn> }
    expect(consulta.in).not.toHaveBeenCalled()
  })

  it('con una marca elegida, solo las sucursales de esa marca que ve la cuenta', async () => {
    mockFiltro.mockResolvedValue({ estado: 'filtrado', marcaId: 1, sucursalIds: [5, 8] })
    const supabase = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 2 }, { suc_id: 5 }], error: null },
    })

    const r = await alcanceDelPeriodo(supabase as unknown as Cliente, claims([2, 5]), null)

    expect(r).toEqual({ ok: true, porEmpresa: true, sucursalIds: [5] })
  })

  it('sin la marca (subida del Excel), todas las que ve', async () => {
    mockFiltro.mockResolvedValue({ estado: 'filtrado', marcaId: 1, sucursalIds: [5] })
    const supabase = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 2 }, { suc_id: 5 }], error: null },
    })

    const r = await alcanceDelPeriodo(supabase as unknown as Cliente, claims(), null, {
      conMarca: false,
    })

    expect(r).toEqual({ ok: true, porEmpresa: true, sucursalIds: [2, 5] })
    expect(mockFiltro).not.toHaveBeenCalled()
  })

  it('si no puede leer la marca o las sucursales, error (nunca "todas")', async () => {
    mockFiltro.mockResolvedValue({ estado: 'error', sucursalIds: null })
    const conSucursales = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 2 }], error: null },
    })
    expect(await alcanceDelPeriodo(conSucursales as unknown as Cliente, claims(), null)).toEqual({
      ok: false,
      error: 'error de marca',
    })

    const sinSucursales = createSupabaseClientMock({
      sgrh_sucursales: { data: null, error: { message: 'boom' } },
    })
    expect((await alcanceDelPeriodo(sinSucursales as unknown as Cliente, claims(), null)).ok).toBe(
      false
    )
  })

  it('sin empresa en el JWT no hay alcance', async () => {
    const r = await sucursalesDeLaCuenta(createSupabaseClientMock({}) as unknown as Cliente, {
      app_metadata: {},
    })
    expect(r.ok).toBe(false)
  })
})

describe('esCuentaDeEmpresa', () => {
  it('sin sucursales asignadas sí; con alguna (aunque sea una lista vacía) no', () => {
    expect(esCuentaDeEmpresa(claims())).toBe(true)
    expect(esCuentaDeEmpresa(claims([2]))).toBe(false)
    expect(esCuentaDeEmpresa({ app_metadata: { sucursal_ids: [] } })).toBe(false)
  })
})

describe('leerNominaPorEmpresa', () => {
  it('lee la bandera de la empresa; null si no se pudo', async () => {
    const si = createSupabaseClientMock({
      sgrh_empresas: { data: { org_nomina_por_empresa: true }, error: null },
    })
    const no = createSupabaseClientMock({
      sgrh_empresas: { data: { org_nomina_por_empresa: false }, error: null },
    })
    const falla = createSupabaseClientMock({
      sgrh_empresas: { data: null, error: { message: 'boom' } },
    })
    expect(await leerNominaPorEmpresa(si as unknown as Cliente)).toBe(true)
    expect(await leerNominaPorEmpresa(no as unknown as Cliente)).toBe(false)
    expect(await leerNominaPorEmpresa(falla as unknown as Cliente)).toBeNull()
  })
})

describe('etiquetasDeSucursales', () => {
  it('arma "Marca · Sucursal" por id, y nada si no hay ids o falla', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_sucursales: {
        data: [
          { suc_id: 2, suc_nombre: 'Centro', sgrh_marcas_comerciales: { mco_nombre: 'Alex' } },
          { suc_id: 5, suc_nombre: 'Mall', sgrh_marcas_comerciales: null },
        ],
        error: null,
      },
    })
    expect(await etiquetasDeSucursales(supabase as unknown as Cliente, [2, 5, 2])).toEqual(
      new Map([
        [2, 'Alex · Centro'],
        [5, 'Mall'],
      ])
    )
    expect(
      await etiquetasDeSucursales(createSupabaseClientMock({}) as unknown as Cliente, [])
    ).toEqual(new Map())
  })
})

describe('periodoFusionadoEn', () => {
  it('devuelve el periodo en que quedó, o null', async () => {
    const fusionado = createSupabaseClientMock(
      {},
      { rpcResponses: { nomina_periodo_actual: { data: 40, error: null } } }
    )
    const no = createSupabaseClientMock(
      {},
      { rpcResponses: { nomina_periodo_actual: { data: null, error: null } } }
    )
    const falla = createSupabaseClientMock(
      {},
      { rpcResponses: { nomina_periodo_actual: { data: null, error: { message: 'x' } } } }
    )
    expect(await periodoFusionadoEn(fusionado as unknown as Cliente, 7)).toBe(40)
    expect(fusionado.rpc).toHaveBeenCalledWith('nomina_periodo_actual', { p_npe_id: 7 })
    expect(await periodoFusionadoEn(no as unknown as Cliente, 7)).toBeNull()
    expect(await periodoFusionadoEn(falla as unknown as Cliente, 7)).toBeNull()
  })
})
