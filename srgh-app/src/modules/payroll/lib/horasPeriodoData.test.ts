import { describe, expect, it, vi } from 'vitest'
import { getHorasDelPeriodo } from './horasPeriodoData'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'

vi.mock('server-only', () => ({}))

type Respuestas = Record<string, { data: unknown; error: unknown }>

const HORARIO_8H = {
  hor_hora_entrada: '08:00:00',
  hor_hora_salida: '17:00:00',
  hor_hora_inicio_almuerzo: '12:00:00',
  hor_hora_fin_almuerzo: '13:00:00',
  hor_hora_inicio_break: null,
  hor_hora_fin_break: null,
}

function programado(fecha: string, over: Record<string, unknown> = {}) {
  return {
    prg_historial_laboral_id: 5,
    prg_fecha: fecha,
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_hora_entrada_custom: null,
    prg_hora_salida_custom: null,
    prg_hora_inicio_almuerzo_custom: null,
    prg_hora_fin_almuerzo_custom: null,
    prg_hora_inicio_break_custom: null,
    prg_hora_fin_break_custom: null,
    sgrh_cat_horarios: HORARIO_8H,
    ...over,
  }
}

let marcaId = 0
function marca(fecha: string, tipo: string, hora: string) {
  marcaId += 1
  return {
    mar_id: marcaId,
    mar_historial_laboral_id: 5,
    mar_tipo: tipo,
    mar_fecha_hora: `${fecha} ${hora}`,
  }
}

function supabase(r: Respuestas) {
  return createSupabaseClientMock(r) as unknown as Awaited<ReturnType<typeof createClient>>
}

const PARAMS = { historialLaboralIds: [5], fechaInicio: '2026-07-06', fechaFin: '2026-07-07' }

describe('getHorasDelPeriodo', () => {
  it('no consulta nada si no hay contratos', async () => {
    const result = await getHorasDelPeriodo(supabase({}), { ...PARAMS, historialLaboralIds: [] })

    expect(result).toEqual({ ok: true, data: new Map() })
  })

  it('cruza programación y marcas para sacar las horas del periodo', async () => {
    const result = await getHorasDelPeriodo(
      supabase({
        sgrh_programacion_semanal: {
          data: [programado('2026-07-06'), programado('2026-07-07')],
          error: null,
        },
        sgrh_marcas_asistencia: {
          data: [
            marca('2026-07-06', 'entrada', '08:00:00'),
            marca('2026-07-06', 'salida', '17:00:00'),
            marca('2026-07-07', 'entrada', '08:00:00'),
            marca('2026-07-07', 'salida', '19:00:00'),
          ],
          error: null,
        },
        sgrh_ausencias: { data: [], error: null },
      }),
      PARAMS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const totales = result.data.get(5)!
    expect(totales.horasEsperadas).toBe(16)
    expect(totales.horasOrdinarias).toBe(16)
    expect(totales.horasExtra).toBe(2)
    expect(totales.diasConProblema).toEqual([])
  })

  it('un día con ausencia aprobada no suma horas esperadas', async () => {
    const result = await getHorasDelPeriodo(
      supabase({
        sgrh_programacion_semanal: {
          data: [programado('2026-07-06'), programado('2026-07-07')],
          error: null,
        },
        sgrh_marcas_asistencia: {
          data: [
            marca('2026-07-06', 'entrada', '08:00:00'),
            marca('2026-07-06', 'salida', '17:00:00'),
          ],
          error: null,
        },
        sgrh_ausencias: {
          data: [
            {
              aus_historial_laboral_id: 5,
              aus_fecha_inicio: '2026-07-07',
              aus_fecha_fin: '2026-07-07',
            },
          ],
          error: null,
        },
      }),
      PARAMS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const totales = result.data.get(5)!
    // Solo cuenta el lunes; el martes está cubierto por la ausencia y no
    // aparece como "sin marcas".
    expect(totales.horasEsperadas).toBe(8)
    expect(totales.diasConProblema).toEqual([])
  })

  it('reporta el día al que le falta la salida', async () => {
    const result = await getHorasDelPeriodo(
      supabase({
        sgrh_programacion_semanal: {
          data: [programado('2026-07-06'), programado('2026-07-07')],
          error: null,
        },
        sgrh_marcas_asistencia: {
          data: [
            marca('2026-07-06', 'entrada', '08:00:00'),
            marca('2026-07-07', 'entrada', '08:00:00'),
            marca('2026-07-07', 'salida', '17:00:00'),
          ],
          error: null,
        },
        sgrh_ausencias: { data: [], error: null },
      }),
      PARAMS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const totales = result.data.get(5)!
    expect(totales.diasConProblema).toEqual([{ fecha: '2026-07-06', problema: 'sin_salida' }])
    // Y no se comió la salida del día siguiente: el lunes queda en 0, no en 33 h.
    expect(totales.horasOrdinarias).toBe(8)
  })

  it('un turno nocturno sí toma la salida de la madrugada siguiente', async () => {
    const nocturno = {
      sgrh_cat_horarios: {
        hor_hora_entrada: '22:00:00',
        hor_hora_salida: '06:00:00',
        hor_hora_inicio_almuerzo: null,
        hor_hora_fin_almuerzo: null,
        hor_hora_inicio_break: null,
        hor_hora_fin_break: null,
      },
    }

    const result = await getHorasDelPeriodo(
      supabase({
        sgrh_programacion_semanal: {
          data: [programado('2026-07-06', nocturno)],
          error: null,
        },
        sgrh_marcas_asistencia: {
          data: [
            marca('2026-07-06', 'entrada', '22:00:00'),
            marca('2026-07-07', 'salida', '06:00:00'),
          ],
          error: null,
        },
        sgrh_ausencias: { data: [], error: null },
      }),
      { ...PARAMS, fechaFin: '2026-07-06' }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const totales = result.data.get(5)!
    expect(totales.horasOrdinarias).toBe(8)
    expect(totales.diasConProblema).toEqual([])
  })

  it('avisa si falla la consulta de marcas', async () => {
    const result = await getHorasDelPeriodo(
      supabase({
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: null, error: { message: 'boom' } },
        sgrh_ausencias: { data: [], error: null },
      }),
      PARAMS
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron cargar las marcas de asistencia.',
    })
  })
})
