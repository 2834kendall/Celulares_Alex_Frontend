import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { createSupabaseQueryMock } from '@/test/supabaseMock'
import { getFiltroMarca, getSelectorMarca } from './contexto-activo'
import {
  leerMarcaContexto,
  MARCA_CONTEXTO_COOKIE,
  serializarMarcaContexto,
} from './marca-contexto-cookie'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/empresa/get-usuario-sucursales', () => ({ getUsuarioSucursalScope: vi.fn() }))

const USR = 7
const CON_DATOS = ['ASISTENCIA_READ']

function marca(id: number, nombre: string, activa = true) {
  return {
    mco_id: id,
    mco_nombre: nombre,
    mco_activa: activa,
    mco_color_acento: null,
    mco_color_sidebar: null,
    mco_logo_path: null,
  }
}

const INFINITY = marca(2, 'Infinity')
const ALEX = marca(1, 'Celulares Alex')

const TIENDAS = [
  { suc_id: 10, sgrh_marcas_comerciales: INFINITY },
  { suc_id: 11, sgrh_marcas_comerciales: ALEX },
  { suc_id: 12, sgrh_marcas_comerciales: ALEX },
]

let consulta: ReturnType<typeof createSupabaseQueryMock>
let from: ReturnType<typeof vi.fn>

function montar({
  permisos = CON_DATOS,
  empresaId = 5 as number | null,
  alcance = null as number[] | null,
  tiendas = TIENDAS as unknown,
  error = null as unknown,
  cookie = null as string | null,
} = {}) {
  consulta = createSupabaseQueryMock({ data: tiendas, error })
  from = vi.fn(() => consulta)
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getClaims: async () => ({
        data: { claims: { app_metadata: { usr_id: USR, empresa_id: empresaId, permisos } } },
      }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  vi.mocked(getUsuarioSucursalScope).mockResolvedValue(alcance)
  vi.mocked(cookies).mockResolvedValue({
    get: (nombre: string) =>
      nombre === MARCA_CONTEXTO_COOKIE && cookie ? { value: cookie } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
}

const elegida = (marcaId: number, usrId = USR) => serializarMarcaContexto(usrId, marcaId)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('leerMarcaContexto', () => {
  it('lee la marca de su propio usuario', () => {
    expect(leerMarcaContexto(elegida(3), USR)).toBe(3)
  })

  it.each([
    ['sin cookie', undefined],
    ['de otro usuario', elegida(3, 99)],
    ['con JSON inválido', '{no-es-json'],
    ['con null', 'null'],
    ['con una marca que no es un id', JSON.stringify({ u: USR, m: 'x' })],
    ['con una marca negativa', JSON.stringify({ u: USR, m: -1 })],
    ['en el formato de la cookie vieja', '3'],
  ])('devuelve null %s', (_caso, raw) => {
    expect(leerMarcaContexto(raw, USR)).toBeNull()
  })

  it('sin usuario no hay marca', () => {
    expect(leerMarcaContexto(elegida(3), null)).toBeNull()
  })
})

describe('getFiltroMarca', () => {
  it('sin cookie no hay filtro, y no hace NINGUNA consulta', async () => {
    montar()
    expect(await getFiltroMarca()).toEqual({ estado: 'sin-filtro', sucursalIds: null })
    expect(createClient).not.toHaveBeenCalled()
    expect(getUsuarioSucursalScope).not.toHaveBeenCalled()
  })

  it('la cookie de otro usuario no filtra ni consulta: máquina compartida', async () => {
    montar({ cookie: elegida(1, 99) })
    expect(await getFiltroMarca()).toEqual({ estado: 'sin-filtro', sucursalIds: null })
    expect(from).not.toHaveBeenCalled()
  })

  it('con una marca elegible devuelve todas sus tiendas', async () => {
    montar({ cookie: elegida(1) })
    expect(await getFiltroMarca()).toEqual({
      estado: 'filtrado',
      marcaId: 1,
      sucursalIds: [11, 12],
    })
  })

  it('no acota por tienda activa: los registros viejos apuntan a las inactivas', async () => {
    montar({ cookie: elegida(1) })
    await getFiltroMarca()
    expect(consulta.select).toHaveBeenCalledOnce()
    expect(vi.mocked(consulta.eq as () => unknown).mock.calls).toEqual([['suc_empresa_id', 5]])
  })

  it('una marca falsificada o de otra empresa se ignora', async () => {
    montar({ cookie: elegida(99) })
    expect(await getFiltroMarca()).toEqual({ estado: 'sin-filtro', sucursalIds: null })
  })

  it('una marca desactivada se ignora', async () => {
    montar({
      cookie: elegida(1),
      tiendas: [
        { suc_id: 10, sgrh_marcas_comerciales: INFINITY },
        { suc_id: 11, sgrh_marcas_comerciales: marca(1, 'Celulares Alex', false) },
        { suc_id: 12, sgrh_marcas_comerciales: marca(3, 'Tercera') },
      ],
    })
    expect(await getFiltroMarca()).toEqual({ estado: 'sin-filtro', sucursalIds: null })
  })

  it('acota las tiendas al alcance de la cuenta', async () => {
    montar({ cookie: elegida(1), alcance: [10, 11] })
    await getFiltroMarca()
    expect(consulta.in).toHaveBeenCalledWith('suc_id', [10, 11])
  })

  it('una cuenta de nivel empresa no acota por tienda', async () => {
    montar({ cookie: elegida(1), alcance: null })
    await getFiltroMarca()
    expect(consulta.in).not.toHaveBeenCalled()
  })

  it('si falla la lectura con cookie es error, nunca "sin filtro"', async () => {
    montar({ cookie: elegida(1), tiendas: null, error: { message: 'fallo' } })
    expect(await getFiltroMarca()).toEqual({ estado: 'error', sucursalIds: null })
  })

  it('perder el permiso apaga el filtro aunque la cookie siga ahí', async () => {
    montar({ cookie: elegida(1), permisos: ['MI_HORARIO_READ'] })
    expect(await getFiltroMarca()).toEqual({ estado: 'sin-filtro', sucursalIds: null })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('getSelectorMarca', () => {
  it('con permiso y dos marcas al alcance las ofrece, ordenadas', async () => {
    montar()
    const { marcas, marcaElegida } = await getSelectorMarca()
    expect(marcas.map((m) => m.nombre)).toEqual(['Celulares Alex', 'Infinity'])
    expect(marcaElegida).toBeNull()
  })

  it('no le manda al cliente la lista de tiendas', async () => {
    montar()
    const { marcas } = await getSelectorMarca()
    expect(marcas[0]).not.toHaveProperty('sucursalIds')
  })

  it('indica la marca elegida', async () => {
    montar({ cookie: elegida(2) })
    expect((await getSelectorMarca()).marcaElegida?.nombre).toBe('Infinity')
  })

  it('una cookie que no corresponde no elige nada', async () => {
    montar({ cookie: elegida(99) })
    expect((await getSelectorMarca()).marcaElegida).toBeNull()
  })

  it('alcance null sin permiso de datos: sin selector y sin consultas', async () => {
    montar({ permisos: ['MI_HORARIO_READ'], alcance: null })
    expect(await getSelectorMarca()).toEqual({ marcas: [], marcaElegida: null })
    expect(getUsuarioSucursalScope).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('tiendas en dos marcas, sin permiso de datos: sin selector', async () => {
    montar({ permisos: ['MI_HORARIO_READ'], alcance: [10, 11] })
    expect((await getSelectorMarca()).marcas).toEqual([])
  })

  it('con permiso y una sola tienda: sin selector ni consulta', async () => {
    montar({ alcance: [11] })
    expect((await getSelectorMarca()).marcas).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('con permiso y dos tiendas de la misma marca: sin selector', async () => {
    montar({
      alcance: [11, 12],
      tiendas: [
        { suc_id: 11, sgrh_marcas_comerciales: ALEX },
        { suc_id: 12, sgrh_marcas_comerciales: ALEX },
      ],
    })
    expect((await getSelectorMarca()).marcas).toEqual([])
  })

  it('con permiso y tiendas en dos marcas: tiene selector, sin importar el rol', async () => {
    montar({ alcance: [10, 11] })
    expect((await getSelectorMarca()).marcas).toHaveLength(2)
  })

  it('una tienda sin marca no cuenta como marca', async () => {
    montar({
      tiendas: [
        { suc_id: 10, sgrh_marcas_comerciales: INFINITY },
        { suc_id: 13, sgrh_marcas_comerciales: null },
      ],
    })
    expect((await getSelectorMarca()).marcas).toEqual([])
  })

  it('sin empresa en el JWT: sin selector', async () => {
    montar({ empresaId: null })
    expect((await getSelectorMarca()).marcas).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('si falla la lectura no muestra selector', async () => {
    montar({ tiendas: null, error: { message: 'fallo' } })
    expect(await getSelectorMarca()).toEqual({ marcas: [], marcaElegida: null })
  })
})
