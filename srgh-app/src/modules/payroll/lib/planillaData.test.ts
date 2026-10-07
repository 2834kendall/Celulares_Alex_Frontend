import { describe, expect, it, vi } from 'vitest'
import type { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { getFilasGuardadas } from './planillaData'

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
