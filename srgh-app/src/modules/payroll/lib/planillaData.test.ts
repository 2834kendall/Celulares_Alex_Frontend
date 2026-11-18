import { describe, expect, it, vi } from 'vitest'
import type { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { getEmpleadosActivos, getFilasGuardadas } from './planillaData'

vi.mock('server-only', () => ({}))

type Cliente = Awaited<ReturnType<typeof createClient>>

const FILAS = [
  {
    ndt_id: 21,
    ndt_historial_laboral_id: 9,
    ndt_pagado: false,
    ndt_horas_ordinarias_diurnas: 88,
    ndt_horas_extra_al_50: null,
    ndt_salario_por_hora: 2500,
    // Las marcas dijeron lo mismo que se paga.
    ndt_horas_asistencia: 88,
    ndt_horas_extra_asistencia: 0,
  },
  {
    ndt_id: 22,
    ndt_historial_laboral_id: 10,
    ndt_pagado: true,
    ndt_horas_ordinarias_diurnas: 96,
    ndt_horas_extra_al_50: 2,
    ndt_salario_por_hora: 2400,
    // Alguien las corrigió: las marcas decían 90 h.
    ndt_horas_asistencia: 90,
    ndt_horas_extra_asistencia: 2,
  },
]

const linea = (detalle: number, codigo: string, monto: number) => ({
  detalle,
  monto,
  sgrh_cat_conceptos_nomina: { con_codigo: codigo },
})

describe('getFilasGuardadas', () => {
  it('arma por contrato las horas y los montos por código de cada fila', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_nomina_detalle: { data: FILAS, error: null },
      sgrh_nomina_linea_ingreso: {
        data: [linea(21, 'BASE', 220000), linea(21, 'COMISION', 50000), linea(22, 'BASE', 240000)],
        error: null,
      },
      sgrh_nomina_linea_deduccion: {
        data: [linea(21, 'PRESTAMO', 20000), linea(21, 'CCSS_OBRERA', 29245)],
        error: null,
      },
    }) as unknown as Cliente

    const r = await getFilasGuardadas(supabase, 7)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.get(9)).toEqual({
      pagado: false,
      horas: 88,
      horasExtra: 0,
      salarioPorHora: 2500,
      montos: { BASE: 220000, COMISION: 50000, PRESTAMO: 20000, CCSS_OBRERA: 29245 },
      horasAjustadas: false,
    })
    expect(r.data.get(10)).toEqual({
      pagado: true,
      horas: 96,
      horasExtra: 2,
      salarioPorHora: 2400,
      montos: { BASE: 240000 },
      horasAjustadas: true,
    })
  })

  it('un periodo sin filas no consulta líneas', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const r = await getFilasGuardadas(supabase as unknown as Cliente, 7)

    expect(r).toEqual({ ok: true, data: new Map() })
    expect(supabase.from.mock.calls.map((c) => c[0])).toEqual(['sgrh_nomina_detalle'])
  })

  // Una plantilla con los montos en 0 es justamente lo que borraba lo
  // guardado al subirla: ante la duda, no se genera.
  it('si no puede leer las líneas, falla en vez de devolver montos en 0', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_nomina_detalle: { data: FILAS, error: null },
      sgrh_nomina_linea_ingreso: { data: null, error: { message: 'boom' } },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
    }) as unknown as Cliente

    expect(await getFilasGuardadas(supabase, 7)).toEqual({
      ok: false,
      error: 'No se pudo leer la planilla guardada del periodo.',
    })
  })
})

describe('getEmpleadosActivos con el periodo', () => {
  const contrato = (labId: number, cedula: string, nombre: string, sucursal = 3) => ({
    lab_id: labId,
    lab_sucursal_id: sucursal,
    lab_salario_base: 400000,
    lab_salario_real: 430000,
    sgrh_empleados: {
      emp_numero_identificacion: cedula,
      emp_nombre: nombre,
      emp_apellido_1: 'Prueba',
      emp_apellido_2: null,
    },
    sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: 48 },
  })
  const ANA = contrato(1, '1-1111-1111', 'Ana')
  const ELENA_TERMINADA = contrato(5, '5-5555-5555', 'Elena')
  const fila = (lab: number, sucursal = 3) => ({
    ndt_historial_laboral_id: lab,
    ndt_sucursal_id: sucursal,
  })
  /** nomina_filas_estado: todas las filas del periodo, las vea o no la cuenta. */
  const estado = (...labs: number[]) => ({
    nomina_filas_estado: {
      data: labs.map((l) => ({
        ndt_historial_laboral_id: l,
        ndt_pagado: false,
        ndt_fecha_pago: null,
      })),
      error: null,
    },
  })

  // Elena terminó y no se ha liquidado: tiene fila en el periodo. Sin ella,
  // el Excel de ese periodo no se podía subir.
  it('suma los contratos terminados que tienen fila en el periodo', async () => {
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: [
          { data: [ANA], error: null },
          { data: [ELENA_TERMINADA], error: null },
        ],
        sgrh_nomina_detalle: { data: [fila(1), fila(5)], error: null },
      },
      { rpcResponses: estado(1, 5) }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok && r.data.map((e) => [e.labId, e.cedula, e.sucursalId])).toEqual([
      [1, '1-1111-1111', 3],
      [5, '5-5555-5555', 3],
    ])
    const extra = supabase.from.mock.results[2].value as { in: { mock: { calls: unknown[][] } } }
    expect(extra.in.mock.calls[0]).toEqual(['lab_id', [5]])
  })

  // Un contrato terminado con fila y el reingreso de la misma persona son dos
  // contratos: van los dos, y la plantilla los distingue por el id.
  it('un reingreso con el contrato viejo en el periodo trae los dos contratos', async () => {
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: [
          { data: [ANA], error: null },
          { data: [contrato(9, '1-1111-1111', 'Ana')], error: null },
        ],
        sgrh_nomina_detalle: { data: [fila(9)], error: null },
      },
      { rpcResponses: estado(9) }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok && r.data.map((e) => e.labId)).toEqual([1, 9])
  })

  // Pedro se pagó esta quincena en la sucursal 1 y después lo trasladaron a la
  // 3. Su fila es de la 1 (y la cuenta de la 3 ni la ve): no va en la planilla
  // de la 3, porque un contrato tiene una sola fila por periodo.
  it('deja afuera al trasladado que ya tiene fila en otra sucursal, y lo avisa aparte', async () => {
    const PEDRO = contrato(2, '2-2222-2222', 'Pedro')
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: { data: [ANA, PEDRO], error: null },
        // La RLS no le deja ver a la cuenta la fila de Pedro.
        sgrh_nomina_detalle: { data: [fila(1)], error: null },
      },
      { rpcResponses: estado(1, 2) }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok && r.data.map((e) => e.labId)).toEqual([1])
    expect(r.ok && r.enOtraSucursal?.map((e) => e.labId)).toEqual([2])
  })

  // Al revés: la fila es de la sucursal del alcance aunque el contrato ya esté
  // en otra. La fila manda: va en esta planilla, con la sucursal de la fila.
  it('incluye una fila del alcance aunque el contrato ya sea de otra sucursal', async () => {
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: [
          { data: [ANA], error: null },
          { data: [contrato(4, '4-4444-4444', 'Iván', 8)], error: null },
        ],
        sgrh_nomina_detalle: { data: [fila(1), fila(4, 3)], error: null },
      },
      { rpcResponses: estado(1, 4) }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok && r.data.map((e) => [e.labId, e.sucursalId])).toEqual([
      [1, 3],
      [4, 3],
    ])
  })

  it('las filas de otras sucursales del periodo no entran', async () => {
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: { data: [ANA], error: null },
        sgrh_nomina_detalle: { data: [fila(1), fila(6, 2)], error: null },
      },
      { rpcResponses: estado(1, 6) }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok && r.data.map((e) => e.labId)).toEqual([1])
    // No fue a buscar el contrato 6.
    expect(supabase.from.mock.calls.map((c) => c[0])).toEqual([
      'sgrh_historial_laboral',
      'sgrh_nomina_detalle',
    ])
  })

  it('busca los contratos de todas las sucursales del alcance', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    await getEmpleadosActivos(supabase as unknown as Cliente, [3, 5])

    const consulta = supabase.from.mock.results[0].value as { in: { mock: { calls: unknown[][] } } }
    expect(consulta.in.mock.calls).toEqual([['lab_sucursal_id', [3, 5]]])
  })

  it('con el alcance vacío no trae a nadie (ni consulta contratos)', async () => {
    const supabase = createSupabaseClientMock({})

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [])

    expect(r).toEqual({ ok: true, data: [] })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('sin periodo, solo los vigentes (como al cargar empleados)', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3])

    expect(r.ok && r.data.map((e) => e.labId)).toEqual([1])
    expect(supabase.from.mock.calls.map((c) => c[0])).toEqual(['sgrh_historial_laboral'])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('si no puede leer las filas del periodo, falla en vez de dejar a alguien afuera', async () => {
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: { data: [ANA], error: null },
        sgrh_nomina_detalle: { data: null, error: { message: 'boom' } },
      },
      { rpcResponses: estado(1) }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok).toBe(false)
  })

  it('si no puede leer todas las filas del periodo, falla', async () => {
    const supabase = createSupabaseClientMock(
      {
        sgrh_historial_laboral: { data: [ANA], error: null },
        sgrh_nomina_detalle: { data: [fila(1)], error: null },
      },
      { rpcResponses: { nomina_filas_estado: { data: null, error: { message: 'boom' } } } }
    )

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, [3], { periodoId: 7 })

    expect(r.ok).toBe(false)
  })

  // Ivannia entró el 9 de mayo de 2025: no se le arma ni se le paga la
  // planilla de diciembre de 2024.
  it('con el fin del periodo, deja afuera a quien ingresó después', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    await getEmpleadosActivos(supabase as unknown as Cliente, [3], { finPeriodo: '2024-12-15' })

    const consulta = supabase.from.mock.results[0].value as {
      lte: { mock: { calls: unknown[][] } }
    }
    expect(consulta.lte.mock.calls).toEqual([['lab_fecha_inicio', '2024-12-15']])
  })

  it('sin fin de periodo no filtra por ingreso', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    await getEmpleadosActivos(supabase as unknown as Cliente, [3])

    const consulta = supabase.from.mock.results[0].value as {
      lte: { mock: { calls: unknown[][] } }
    }
    expect(consulta.lte.mock.calls).toEqual([])
  })
})
