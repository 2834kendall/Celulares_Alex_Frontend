import { describe, expect, it } from 'vitest'
import { findWorkableDay, getDayAssignments, isWorkable } from './workingDay'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'

type ClientMock = ReturnType<typeof createSupabaseClientMock>

function asClient(client: ClientMock) {
  return client as unknown as Awaited<ReturnType<typeof createClient>>
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    prg_historial_laboral_id: 1,
    prg_empleado_id: 10,
    prg_sucursal_id: 100,
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_hora_entrada_custom: null,
    sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
    ...overrides,
  }
}

describe('isWorkable', () => {
  const base = {
    employmentHistoryId: 1,
    employeeId: 10,
    branchId: 100,
    expectedStart: '08:00',
    expectedEnd: null,
    expectedLunchStart: null,
    expectedLunchEnd: null,
    expectedBreakStart: null,
    expectedBreakEnd: null,
    isDayOff: false,
    isHoliday: false,
  }

  it('un dia normal habilita a marcar', () => {
    expect(isWorkable(base)).toBe(true)
  })

  it('un dia libre no habilita a marcar', () => {
    expect(isWorkable({ ...base, isDayOff: true })).toBe(false)
  })

  it('un feriado no habilita a marcar', () => {
    expect(isWorkable({ ...base, isHoliday: true })).toBe(false)
  })
})

describe('getDayAssignments', () => {
  it('mapea la fila a la sucursal del dia y la hora esperada del horario', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [row({ prg_sucursal_id: 200 })], error: null },
    })

    const result = await getDayAssignments(asClient(client), '2026-07-25', [100, 200])

    expect(result).toEqual({
      ok: true,
      data: [
        {
          employmentHistoryId: 1,
          employeeId: 10,
          branchId: 200,
          expectedStart: '08:00',
          expectedEnd: null,
          expectedLunchStart: null,
          expectedLunchEnd: null,
          expectedBreakStart: null,
          expectedBreakEnd: null,
          isDayOff: false,
          isHoliday: false,
        },
      ],
    })
  })

  it('toma almuerzo y receso de la plantilla si el dia no es personalizado', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [
          row({
            // Almuerzo personalizado suelto, sin entrada/salida propias: se ignora.
            prg_hora_inicio_almuerzo_custom: '11:00:00',
            sgrh_cat_horarios: {
              hor_hora_entrada: '08:00:00',
              hor_hora_inicio_almuerzo: '12:00:00',
              hor_hora_fin_almuerzo: '13:00:00',
              hor_hora_inicio_break: '10:00:00',
              hor_hora_fin_break: '10:10:00',
            },
          }),
        ],
        error: null,
      },
    })

    const result = await getDayAssignments(asClient(client), '2026-07-25', null)

    expect(result.ok && result.data[0]).toMatchObject({
      expectedLunchStart: '12:00',
      expectedLunchEnd: '13:00',
      expectedBreakStart: '10:00',
      expectedBreakEnd: '10:10',
    })
  })

  it('un dia personalizado usa su propio almuerzo, aunque no tenga receso', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [
          row({
            prg_hora_entrada_custom: '09:00:00',
            prg_hora_salida_custom: '17:00:00',
            prg_hora_inicio_almuerzo_custom: '13:00:00',
            prg_hora_fin_almuerzo_custom: '13:30:00',
            sgrh_cat_horarios: {
              hor_hora_entrada: '08:00:00',
              hor_hora_inicio_break: '10:00:00',
              hor_hora_fin_break: '10:10:00',
            },
          }),
        ],
        error: null,
      },
    })

    const result = await getDayAssignments(asClient(client), '2026-07-25', null)

    expect(result.ok && result.data[0]).toMatchObject({
      expectedStart: '09:00',
      expectedLunchStart: '13:00',
      expectedLunchEnd: '13:30',
      expectedBreakStart: null,
      expectedBreakEnd: null,
    })
  })

  it('la hora custom del dia gana sobre la del horario del catalogo', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [row({ prg_hora_entrada_custom: '10:30:00' })],
        error: null,
      },
    })

    const result = await getDayAssignments(asClient(client), '2026-07-25', null)

    expect(result.ok && result.data[0].expectedStart).toBe('10:30')
  })

  it('sin horario ni hora custom, la hora esperada queda en null', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [row({ prg_hora_entrada_custom: null, sgrh_cat_horarios: null })],
        error: null,
      },
    })

    const result = await getDayAssignments(asClient(client), '2026-07-25', null)

    expect(result.ok && result.data[0].expectedStart).toBeNull()
  })

  it('acota por sucursal cuando el alcance no es null', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [], error: null },
    })

    await getDayAssignments(asClient(client), '2026-07-25', [100])

    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('prg_fecha', '2026-07-25')
    expect(builder.in).toHaveBeenCalledWith('prg_sucursal_id', [100])
  })

  it('con alcance null (ADMIN/RRHH) no acota por sucursal', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [], error: null },
    })

    await getDayAssignments(asClient(client), '2026-07-25', null)

    const builder = client.from.mock.results[0].value
    expect(builder.in).not.toHaveBeenCalled()
  })

  it('devuelve error si falla la consulta', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
    })

    const result = await getDayAssignments(asClient(client), '2026-07-25', null)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar la programacion del dia.' })
  })
})

describe('findWorkableDay', () => {
  it('encuentra el turno del empleado y acota la consulta a el', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [row()], error: null },
    })

    const result = await findWorkableDay(asClient(client), '2026-07-25', 10, [100])

    expect(result?.branchId).toBe(100)
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('prg_empleado_id', 10)
  })

  it('devuelve null si el dia esta marcado como libre', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [row({ prg_es_dia_libre: true })], error: null },
    })

    expect(await findWorkableDay(asClient(client), '2026-07-25', 10, [100])).toBeNull()
  })

  it('devuelve null si el dia es feriado', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [row({ prg_es_feriado: true })], error: null },
    })

    expect(await findWorkableDay(asClient(client), '2026-07-25', 10, [100])).toBeNull()
  })

  it('devuelve null si no hay programacion', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [], error: null },
    })

    expect(await findWorkableDay(asClient(client), '2026-07-25', 10, [100])).toBeNull()
  })

  it('devuelve null si la consulta falla: un error de red no es permiso para marcar', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
    })

    expect(await findWorkableDay(asClient(client), '2026-07-25', 10, [100])).toBeNull()
  })
})
