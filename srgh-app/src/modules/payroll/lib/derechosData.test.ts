import { describe, expect, it, vi } from 'vitest'
import { cargarAusencias, cargarQuincenas, puedeLeerAusencias } from './derechosData'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'

vi.mock('server-only', () => ({}))

type Respuesta = { data: unknown; error: unknown }

function cliente(r: Record<string, Respuesta | Respuesta[]>) {
  return createSupabaseClientMock(r) as unknown as Awaited<ReturnType<typeof createClient>> & {
    from: ReturnType<typeof vi.fn>
  }
}

function fila(i: number) {
  return {
    ndt_id: i,
    ndt_historial_laboral_id: 1,
    ndt_salario_bruto: 100,
    ndt_pagado: true,
    sgrh_nomina_periodo: {
      npe_periodo_mes: 1,
      npe_periodo_anio: 2000 + Math.floor(i / 24),
      npe_quincena: 1,
      npe_fecha_inicio_periodo: null,
      npe_fecha_fin_periodo: null,
    },
  }
}

const CONTRATO = {
  labId: 1,
  fechaInicio: '2000-01-01',
  fechaFin: null,
  salarioMensual: 200,
  liquidado: false,
}

describe('cargarQuincenas', () => {
  // Supabase corta en 1000 filas sin avisar: sin paginar, lo que pasaba de
  // mil nunca llegaba al aguinaldo.
  it('lee por páginas: con 1005 quincenas llegan las 1005', async () => {
    const supabase = cliente({
      sgrh_nomina_detalle: [
        { data: Array.from({ length: 1000 }, (_, i) => fila(i)), error: null },
        { data: Array.from({ length: 5 }, (_, i) => fila(1000 + i)), error: null },
      ],
    })

    const result = await cargarQuincenas(supabase, [CONTRATO])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.get(1)).toHaveLength(1005)
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('usa las fechas del periodo, o las de la quincena si el periodo no las tiene', async () => {
    const supabase = cliente({
      sgrh_nomina_detalle: {
        data: [
          {
            ...fila(1),
            sgrh_nomina_periodo: {
              npe_periodo_mes: 2,
              npe_periodo_anio: 2026,
              npe_quincena: 2,
              npe_fecha_inicio_periodo: null,
              npe_fecha_fin_periodo: null,
            },
          },
        ],
        error: null,
      },
    })

    const result = await cargarQuincenas(supabase, [CONTRATO])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.get(1)![0]).toMatchObject({
      fechaInicio: '2026-02-16',
      fechaFin: '2026-02-28',
      salarioMensualContrato: 200,
      etiqueta: 'Febrero 2026 · 2ª quincena',
    })
  })

  it('un error de lectura no se traga: devuelve error', async () => {
    const supabase = cliente({ sgrh_nomina_detalle: { data: null, error: { message: 'x' } } })

    const result = await cargarQuincenas(supabase, [CONTRATO])

    expect(result.ok).toBe(false)
  })
})

describe('cargarAusencias', () => {
  it('clasifica: subsidio (maternidad o no), vacaciones, y cuenta las que no tienen tipo', async () => {
    const tipo = (codigo: string, ccss: boolean, vac: boolean) => ({
      tau_codigo: codigo,
      tau_requiere_documento_ccss: ccss,
      tau_descuenta_vacaciones: vac,
    })
    const fila = (id: number, t: unknown) => ({
      aus_id: id,
      aus_historial_laboral_id: 1,
      aus_fecha_inicio: '2026-01-05',
      aus_fecha_fin: '2026-01-06',
      sgrh_cat_tipos_ausencia: t,
    })
    const supabase = cliente({
      sgrh_ausencias: {
        data: [
          fila(1, tipo('INC_MAT', true, false)),
          fila(2, tipo('INC_ENF', true, false)),
          fila(3, tipo('VAC', false, true)),
          fila(4, tipo('PERM_CG', false, false)),
          fila(5, null),
        ],
        error: null,
      },
    })

    const result = await cargarAusencias(supabase, [1])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const a = result.data.get(1)!
    expect(a.subsidios.map((s) => s.esMaternidad)).toEqual([true, false])
    expect(a.vacaciones).toHaveLength(1)
    expect(a.sinTipo).toBe(1)
  })
})

describe('puedeLeerAusencias', () => {
  it('lee el permiso del JWT', () => {
    expect(puedeLeerAusencias({ app_metadata: { permisos: ['AUSENCIAS_READ'] } })).toBe(true)
    expect(puedeLeerAusencias({ app_metadata: { permisos: [] } })).toBe(false)
    expect(puedeLeerAusencias({})).toBe(false)
  })
})
