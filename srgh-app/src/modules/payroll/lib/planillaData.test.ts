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
  },
  {
    ndt_id: 22,
    ndt_historial_laboral_id: 10,
    ndt_pagado: true,
    ndt_horas_ordinarias_diurnas: 96,
    ndt_horas_extra_al_50: 2,
    ndt_salario_por_hora: 2400,
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
    })
    expect(r.data.get(10)).toEqual({
      pagado: true,
      horas: 96,
      horasExtra: 2,
      salarioPorHora: 2400,
      montos: { BASE: 240000 },
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
  const contrato = (labId: number, cedula: string, nombre: string) => ({
    lab_id: labId,
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

  // Elena terminó y no se ha liquidado: tiene fila en el periodo. Sin ella,
  // el Excel de ese periodo no se podía subir.
  it('suma los contratos terminados que tienen fila en el periodo', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: [
        { data: [ANA], error: null },
        { data: [ELENA_TERMINADA], error: null },
      ],
      sgrh_nomina_detalle: {
        data: [{ ndt_historial_laboral_id: 1 }, { ndt_historial_laboral_id: 5 }],
        error: null,
      },
    })

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, 3, { periodoId: 7 })

    expect(r.ok && r.data.map((e) => [e.labId, e.cedula])).toEqual([
      [1, '1-1111-1111'],
      [5, '5-5555-5555'],
    ])
    const extra = supabase.from.mock.results[2].value as { in: { mock: { calls: unknown[][] } } }
    expect(extra.in.mock.calls[0]).toEqual(['lab_id', [5]])
  })

  it('si la cédula ya tiene un contrato vigente (reingreso), gana el vigente', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: [
        { data: [ANA], error: null },
        { data: [{ ...contrato(9, '1-1111-1111', 'Ana'), lab_salario_real: 300000 }], error: null },
      ],
      sgrh_nomina_detalle: { data: [{ ndt_historial_laboral_id: 9 }], error: null },
    })

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, 3, { periodoId: 7 })

    expect(r.ok && r.data.map((e) => e.labId)).toEqual([1])
  })

  it('sin periodo, solo los vigentes (como al cargar empleados)', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, 3)

    expect(r.ok && r.data.map((e) => e.labId)).toEqual([1])
    expect(supabase.from.mock.calls.map((c) => c[0])).toEqual(['sgrh_historial_laboral'])
  })

  it('si no puede leer las filas del periodo, falla en vez de dejar a alguien afuera', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
      sgrh_nomina_detalle: { data: null, error: { message: 'boom' } },
    })

    const r = await getEmpleadosActivos(supabase as unknown as Cliente, 3, { periodoId: 7 })

    expect(r.ok).toBe(false)
  })

  // Ivannia entró el 9 de mayo de 2025: no se le arma ni se le paga la
  // planilla de diciembre de 2024.
  it('con el fin del periodo, deja afuera a quien ingresó después', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    await getEmpleadosActivos(supabase as unknown as Cliente, 3, { finPeriodo: '2024-12-15' })

    const consulta = supabase.from.mock.results[0].value as {
      lte: { mock: { calls: unknown[][] } }
    }
    expect(consulta.lte.mock.calls).toEqual([['lab_fecha_inicio', '2024-12-15']])
  })

  it('sin fin de periodo no filtra por ingreso', async () => {
    const supabase = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [ANA], error: null },
    })

    await getEmpleadosActivos(supabase as unknown as Cliente, 3)

    const consulta = supabase.from.mock.results[0].value as {
      lte: { mock: { calls: unknown[][] } }
    }
    expect(consulta.lte.mock.calls).toEqual([])
  })
})
