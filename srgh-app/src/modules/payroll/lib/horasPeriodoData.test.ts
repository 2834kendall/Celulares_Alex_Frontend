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
  return createSupabaseClientMock({
    sgrh_cat_feriados: { data: [], error: null },
    ...r,
  }) as unknown as Awaited<ReturnType<typeof createClient>>
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

  it('un día sin fila de programación se marca sinProgramar, a diferencia de un día libre', async () => {
    const result = await getHorasDelPeriodo(
      supabase({
        // Solo el 06 tiene fila; el 07 no tiene ninguna (nadie lo cargó).
        sgrh_programacion_semanal: { data: [programado('2026-07-06')], error: null },
        sgrh_marcas_asistencia: {
          data: [
            marca('2026-07-06', 'entrada', '08:00:00'),
            marca('2026-07-06', 'salida', '17:00:00'),
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
    expect(totales.diasSinProgramar).toBe(1)
    expect(totales.diasConProblema).toEqual([{ fecha: '2026-07-07', problema: 'sin_programar' }])
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

  // Cuánto se paga de cada día de ausencia lo decide su tipo en el catálogo,
  // no una regla fija: vacaciones y permisos con goce, completo; sin goce,
  // nada; y las incapacidades CCSS/INS, nada en el base porque se pagan como
  // subsidio por su propio camino.
  describe('fracción pagada según el tipo de ausencia', () => {
    const tipo = (over: Record<string, unknown>) => ({
      tau_codigo: 'VAC',
      tau_requiere_documento_ccss: false,
      tau_porcentaje_pago_empleador: 100,
      tau_paga_empleador_dias: 0,
      tau_es_intradia: false,
      ...over,
    })
    const leer = async (ausencia: Record<string, unknown>) => {
      const result = await getHorasDelPeriodo(
        supabase({
          sgrh_programacion_semanal: {
            data: [programado('2026-07-06'), programado('2026-07-07')],
            error: null,
          },
          sgrh_marcas_asistencia: { data: [], error: null },
          sgrh_ausencias: {
            data: [
              {
                aus_historial_laboral_id: 5,
                aus_fecha_inicio: '2026-07-06',
                aus_fecha_fin: '2026-07-07',
                ...ausencia,
              },
            ],
            error: null,
          },
        }),
        PARAMS
      )
      if (!result.ok) throw new Error(result.error)
      return result.data.get(5)!
    }

    it('vacaciones: se acreditan las 16 h programadas', async () => {
      const t = await leer({ sgrh_cat_tipos_ausencia: tipo({}) })
      expect(t.horasAcreditadas).toBe(16)
      expect(t.diasJustificados).toBe(2)
      expect(t.dias.map((d) => d.justificacion?.codigo)).toEqual(['VAC', 'VAC'])
    })

    it('permiso sin goce: no se acredita nada', async () => {
      const t = await leer({
        sgrh_cat_tipos_ausencia: tipo({ tau_codigo: 'PERM_SG', tau_porcentaje_pago_empleador: 0 }),
      })
      expect(t.horasAcreditadas).toBe(0)
      expect(t.diasJustificados).toBe(2)
    })

    it('incapacidad CCSS: no se acredita en el base, se paga como subsidio aparte', async () => {
      const t = await leer({
        sgrh_cat_tipos_ausencia: tipo({
          tau_codigo: 'INC_ENF',
          tau_requiere_documento_ccss: true,
          tau_porcentaje_pago_empleador: 50,
          tau_paga_empleador_dias: 3,
        }),
      })
      expect(t.horasAcreditadas).toBe(0)
    })

    it('permiso con tope de días: solo se pagan los primeros, contados desde el inicio', async () => {
      const t = await leer({
        sgrh_cat_tipos_ausencia: tipo({ tau_codigo: 'PERM_CG', tau_paga_empleador_dias: 1 }),
      })
      expect(t.dias.map((d) => d.horasAcreditadas)).toEqual([8, 0])
    })

    // Vacaciones y una incapacidad encima (registrarla desde nómina no chequea
    // traslape en la base): gana el subsidio, o esos días se pagaban dos veces.
    it('si una incapacidad se superpone a unas vacaciones, gana la incapacidad', async () => {
      const result = await getHorasDelPeriodo(
        supabase({
          sgrh_programacion_semanal: {
            data: [programado('2026-07-06'), programado('2026-07-07')],
            error: null,
          },
          sgrh_marcas_asistencia: { data: [], error: null },
          sgrh_ausencias: {
            data: [
              {
                aus_historial_laboral_id: 5,
                aus_fecha_inicio: '2026-07-01',
                aus_fecha_fin: '2026-07-15',
                sgrh_cat_tipos_ausencia: tipo({}),
              },
              {
                aus_historial_laboral_id: 5,
                aus_fecha_inicio: '2026-07-07',
                aus_fecha_fin: '2026-07-07',
                sgrh_cat_tipos_ausencia: tipo({
                  tau_codigo: 'INC_ENF',
                  tau_requiere_documento_ccss: true,
                  tau_porcentaje_pago_empleador: 50,
                }),
              },
            ],
            error: null,
          },
        }),
        PARAMS
      )
      if (!result.ok) throw new Error(result.error)
      const t = result.data.get(5)!
      expect(t.dias.map((d) => d.justificacion?.codigo)).toEqual(['VAC', 'INC_ENF'])
      expect(t.horasAcreditadas).toBe(8)
    })

    // El tope se cuenta desde que empezó la ausencia, no desde que empezó el
    // periodo: una ausencia que viene de la quincena anterior ya gastó días.
    it('el tope cuenta los días de la ausencia anteriores al periodo', async () => {
      const t = await leer({
        aus_fecha_inicio: '2026-07-05',
        sgrh_cat_tipos_ausencia: tipo({ tau_codigo: 'PERM_CG', tau_paga_empleador_dias: 1 }),
      })
      expect(t.horasAcreditadas).toBe(0)
    })
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

  // La salida de las 6 a. m. cierra el turno de la noche anterior. En su
  // propio día quedaba además como una salida suelta sin entrada, y se
  // reportaba como problema del día de descanso: un falso positivo en cada
  // turno nocturno, y bloqueo del pago cuando ese día sí estaba programado.
  it('la salida de madrugada no vuelve a contarse en su propio día', async () => {
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
        // El 7 no tiene programación: es el descanso después del turno.
        sgrh_programacion_semanal: { data: [programado('2026-07-06', nocturno)], error: null },
        sgrh_marcas_asistencia: {
          data: [
            marca('2026-07-06', 'entrada', '22:00:00'),
            marca('2026-07-07', 'salida', '06:00:00'),
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
    expect(totales.horasOrdinarias).toBe(8)
    expect(totales.diasConProblema).toEqual([])
    expect(totales.diasQueBloquean).toEqual([])
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

  // Nadie llena prg_es_feriado al programar: el feriado se lee del catálogo.
  it('acredita un feriado de pago obligatorio del catálogo aunque la programación no lo marque', async () => {
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
        sgrh_ausencias: { data: [], error: null },
        sgrh_cat_feriados: { data: [{ fer_fecha: '2026-07-07' }], error: null },
      }),
      PARAMS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const totales = result.data.get(5)!
    expect(totales.horasAcreditadas).toBe(8)
    expect(totales.diasQueBloquean).toEqual([])
  })

  it('devuelve error si no puede leer los feriados', async () => {
    const result = await getHorasDelPeriodo(
      supabase({
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
        sgrh_ausencias: { data: [], error: null },
        sgrh_cat_feriados: { data: null, error: { message: 'boom' } },
      }),
      PARAMS
    )

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los feriados del periodo.' })
  })
})
