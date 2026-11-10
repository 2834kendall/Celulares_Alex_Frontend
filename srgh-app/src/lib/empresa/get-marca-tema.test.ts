import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMarcaTema, SIN_MARCA } from './get-marca-tema'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

type Result = { data: unknown; error: unknown }

function mock(cuenta: Result, contrato: Result = { data: null, error: null }) {
  const client = createSupabaseClientMock({
    sgrh_usuarios_empresa_rol: cuenta,
    sgrh_historial_laboral: contrato,
  })
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return client
}

const marcaRow = (id: number, nombre: string) => ({
  mco_id: id,
  mco_nombre: nombre,
  mco_color_acento: '#9f1239',
  mco_color_sidebar: null,
  mco_logo_path: `1/marcas/${id}/a.png`,
})

const sucursal = (id: number, nombre: string, marca: ReturnType<typeof marcaRow> | null) => ({
  suc_id: id,
  suc_nombre: nombre,
  sgrh_marcas_comerciales: marca,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getMarcaTema', () => {
  it('sin usr_id no consulta nada', async () => {
    expect(await getMarcaTema(null, 5)).toEqual(SIN_MARCA)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('usa la sucursal de la cuenta (GERENTE) y su marca', async () => {
    mock(
      {
        data: {
          uer_sucursal_id: 10,
          sgrh_sucursales: sucursal(10, 'Mall', marcaRow(1, 'Celulares Alex')),
        },
        error: null,
      },
      {
        data: {
          lab_sucursal_id: 20,
          sgrh_sucursales: sucursal(20, 'Centro', marcaRow(2, 'Infinity')),
        },
        error: null,
      }
    )
    expect(await getMarcaTema(7, 5)).toEqual({
      sucursalId: 10,
      sucursalNombre: 'Mall',
      marca: {
        id: 1,
        nombre: 'Celulares Alex',
        colorAcento: '#9f1239',
        colorSidebar: null,
        logoPath: '1/marcas/1/a.png',
      },
    })
  })

  it('sin sucursal en la cuenta (EMPLEADO), usa la del contrato vigente', async () => {
    mock(
      { data: null, error: null },
      {
        data: {
          lab_sucursal_id: 20,
          sgrh_sucursales: sucursal(20, 'Centro', marcaRow(2, 'Infinity')),
        },
        error: null,
      }
    )
    const tema = await getMarcaTema(7, 5)
    expect(tema.sucursalNombre).toBe('Centro')
    expect(tema.marca?.nombre).toBe('Infinity')
  })

  it('busca el contrato filtrando por el emp_id recibido y solo el vigente', async () => {
    const client = mock({ data: null, error: null })
    await getMarcaTema(7, 5)
    const contrato = client.from.mock.results.find(
      (_, i) => client.from.mock.calls[i][0] === 'sgrh_historial_laboral'
    )!.value as { eq: ReturnType<typeof vi.fn>; is: ReturnType<typeof vi.fn> }
    expect(contrato.eq).toHaveBeenCalledWith('lab_empleado_id', 5)
    expect(contrato.is).toHaveBeenCalledWith('lab_fecha_fin', null)
  })

  it('sin emp_id (ADMIN sin expediente) no consulta contratos', async () => {
    const client = mock({ data: null, error: null })
    expect(await getMarcaTema(7, null)).toEqual(SIN_MARCA)
    expect(client.from).not.toHaveBeenCalledWith('sgrh_historial_laboral')
  })

  it('una sucursal sin marca devuelve la sucursal con marca null', async () => {
    mock({
      data: { uer_sucursal_id: 10, sgrh_sucursales: sucursal(10, 'Mall', null) },
      error: null,
    })
    expect(await getMarcaTema(7, null)).toEqual({
      sucursalId: 10,
      sucursalNombre: 'Mall',
      marca: null,
    })
  })

  it('si la consulta de la cuenta falla, cae al contrato', async () => {
    mock(
      { data: null, error: { message: 'x' } },
      {
        data: {
          lab_sucursal_id: 20,
          sgrh_sucursales: sucursal(20, 'Centro', marcaRow(2, 'Infinity')),
        },
        error: null,
      }
    )
    expect((await getMarcaTema(7, 5)).marca?.id).toBe(2)
  })

  it('si todo falla, devuelve SIN_MARCA', async () => {
    mock({ data: null, error: { message: 'x' } }, { data: null, error: { message: 'y' } })
    expect(await getMarcaTema(7, 5)).toEqual(SIN_MARCA)
  })
})
