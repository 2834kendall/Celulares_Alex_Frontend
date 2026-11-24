import { describe, expect, it } from 'vitest'
import {
  assignSplitScheduleSchema,
  scheduleSchema,
  toScheduleColumns,
  type ScheduleInput,
} from './types'

const base: ScheduleInput = {
  hor_nombre: 'Turno Diurno',
  hor_tipo_jornada_id: 1,
  hor_hora_entrada: '08:00',
  hor_hora_salida: '12:00',
  hor_hora_inicio_almuerzo: '12:00',
  hor_hora_fin_almuerzo: '13:00',
  hor_duracion_almuerzo_min: 60,
  hor_hora_inicio_break: '',
  hor_hora_fin_break: '',
  hor_duracion_break_min: 10,
  hor_activo: true,
}

const parse = (extra: Partial<ScheduleInput>) => scheduleSchema.safeParse({ ...base, ...extra })

function errorEn(extra: Partial<ScheduleInput>, campo: string): string | undefined {
  const result = parse(extra)
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path[0] === campo)?.message
}

describe('scheduleSchema · segundo bloque (jornada partida)', () => {
  it('acepta una plantilla sin segundo bloque', () => {
    expect(parse({}).success).toBe(true)
  })

  it('acepta el segundo bloque vacio (el formulario manda cadenas vacias)', () => {
    expect(parse({ hor_hora_entrada_2: '', hor_hora_salida_2: '' }).success).toBe(true)
  })

  it('acepta un segundo bloque valido con hueco', () => {
    expect(parse({ hor_hora_entrada_2: '14:00', hor_hora_salida_2: '18:00' }).success).toBe(true)
  })

  it('acepta un segundo bloque que empieza justo cuando termina el primero', () => {
    expect(parse({ hor_hora_entrada_2: '12:00', hor_hora_salida_2: '16:00' }).success).toBe(true)
  })

  it('rechaza solo la entrada del segundo bloque', () => {
    expect(
      errorEn({ hor_hora_entrada_2: '14:00', hor_hora_salida_2: '' }, 'hor_hora_salida_2')
    ).toBe('Indique la entrada y la salida del segundo bloque.')
  })

  it('rechaza solo la salida del segundo bloque', () => {
    expect(
      errorEn({ hor_hora_entrada_2: '', hor_hora_salida_2: '18:00' }, 'hor_hora_salida_2')
    ).toBe('Indique la entrada y la salida del segundo bloque.')
  })

  it('rechaza un segundo bloque que termina antes de empezar', () => {
    expect(
      errorEn({ hor_hora_entrada_2: '18:00', hor_hora_salida_2: '14:00' }, 'hor_hora_salida_2')
    ).toBe('La salida del segundo bloque debe ser posterior a su entrada.')
  })

  it('rechaza un segundo bloque que empieza antes de que termine el primero', () => {
    expect(
      errorEn({ hor_hora_entrada_2: '11:00', hor_hora_salida_2: '15:00' }, 'hor_hora_entrada_2')
    ).toBe('El segundo bloque debe empezar cuando termina el primero o despues.')
  })

  it('rechaza un formato de hora invalido en el segundo bloque', () => {
    expect(parse({ hor_hora_entrada_2: '2pm', hor_hora_salida_2: '18:00' }).success).toBe(false)
  })
})

describe('scheduleSchema · sucursal de cada bloque', () => {
  const partida = { hor_hora_entrada_2: '14:00', hor_hora_salida_2: '18:00' }

  it('acepta dos sucursales distintas con segundo bloque', () => {
    expect(parse({ ...partida, hor_sucursal_id: 10, hor_sucursal_id_2: 20 }).success).toBe(true)
  })

  it('acepta la misma sucursal en los dos bloques', () => {
    expect(parse({ ...partida, hor_sucursal_id: 10, hor_sucursal_id_2: 10 }).success).toBe(true)
  })

  it('acepta no definir sucursales', () => {
    expect(parse({ ...partida, hor_sucursal_id: null, hor_sucursal_id_2: null }).success).toBe(true)
  })

  it('rechaza definir solo la sucursal del primer bloque', () => {
    expect(
      errorEn({ ...partida, hor_sucursal_id: 10, hor_sucursal_id_2: null }, 'hor_sucursal_id_2')
    ).toBe('Elija la sucursal de los dos bloques, o deje las dos como la de la asignacion.')
  })

  it('rechaza definir solo la sucursal del segundo bloque', () => {
    expect(
      errorEn({ ...partida, hor_sucursal_id: null, hor_sucursal_id_2: 20 }, 'hor_sucursal_id_2')
    ).toBe('Elija la sucursal de los dos bloques, o deje las dos como la de la asignacion.')
  })

  it('rechaza sucursales sin segundo bloque', () => {
    expect(errorEn({ hor_sucursal_id: 10, hor_sucursal_id_2: 20 }, 'hor_sucursal_id')).toBe(
      'Las sucursales por bloque solo aplican a una jornada partida.'
    )
  })

  it('rechaza un id de sucursal invalido', () => {
    expect(parse({ ...partida, hor_sucursal_id: 0, hor_sucursal_id_2: 20 }).success).toBe(false)
  })
})

describe('assignSplitScheduleSchema', () => {
  const valid = {
    assignmentId: null,
    employmentHistoryId: 1,
    employeeId: 2,
    date: '2026-01-06',
    scheduleId: 8,
  }

  it('acepta la asignacion sin sucursales: las define la plantilla', () => {
    expect(assignSplitScheduleSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['fecha', { date: '06/01/2026' }],
    ['plantilla', { scheduleId: 0 }],
    ['colaborador', { employeeId: -1 }],
  ])('rechaza %s invalida', (_campo, patch) => {
    expect(assignSplitScheduleSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
  })
})

describe('toScheduleColumns', () => {
  const columnas = (extra: Partial<ScheduleInput>) => {
    const result = parse(extra)
    if (!result.success) throw new Error(JSON.stringify(result.error.issues))
    return toScheduleColumns(result.data)
  }

  it('sin segundo bloque deja las columnas en NULL y respeta almuerzo y break', () => {
    const c = columnas({
      hor_hora_salida: '17:00',
      hor_hora_inicio_break: '10:00',
      hor_hora_fin_break: '10:10',
    })

    expect(c).toMatchObject({
      hor_hora_entrada_2: null,
      hor_hora_salida_2: null,
      hor_hora_inicio_almuerzo: '12:00',
      hor_hora_fin_almuerzo: '13:00',
      hor_duracion_almuerzo_min: 60,
      hor_hora_inicio_break: '10:00',
      hor_hora_fin_break: '10:10',
    })
  })

  it('sin break manda NULL, no cadena vacia', () => {
    const c = columnas({ hor_hora_salida: '17:00' })

    expect(c.hor_hora_inicio_break).toBeNull()
    expect(c.hor_hora_fin_break).toBeNull()
  })

  it('con segundo bloque, el almuerzo pasa a ser el hueco entre los dos bloques', () => {
    const c = columnas({ hor_hora_entrada_2: '14:30', hor_hora_salida_2: '18:00' })

    expect(c).toMatchObject({
      hor_hora_entrada: '08:00',
      hor_hora_salida: '12:00',
      hor_hora_entrada_2: '14:30',
      hor_hora_salida_2: '18:00',
      hor_hora_inicio_almuerzo: '12:00',
      hor_hora_fin_almuerzo: '14:30',
      hor_duracion_almuerzo_min: 150,
    })
  })

  it('con segundo bloque se descarta el break aunque venga lleno', () => {
    const c = columnas({
      hor_hora_entrada_2: '14:00',
      hor_hora_salida_2: '18:00',
      hor_hora_inicio_break: '10:00',
      hor_hora_fin_break: '10:15',
    })

    expect(c.hor_hora_inicio_break).toBeNull()
    expect(c.hor_hora_fin_break).toBeNull()
  })

  it('un segundo bloque vacio se guarda como NULL', () => {
    const c = columnas({ hor_hora_entrada_2: '', hor_hora_salida_2: '' })

    expect(c.hor_hora_entrada_2).toBeNull()
    expect(c.hor_hora_salida_2).toBeNull()
  })

  it('con segundo bloque conserva las sucursales de cada bloque', () => {
    const c = columnas({
      hor_hora_entrada_2: '14:00',
      hor_hora_salida_2: '18:00',
      hor_sucursal_id: 10,
      hor_sucursal_id_2: 20,
    })

    expect(c).toMatchObject({ hor_sucursal_id: 10, hor_sucursal_id_2: 20 })
  })

  it('con segundo bloque y sin sucursales las guarda en NULL', () => {
    const c = columnas({ hor_hora_entrada_2: '14:00', hor_hora_salida_2: '18:00' })

    expect(c).toMatchObject({ hor_sucursal_id: null, hor_sucursal_id_2: null })
  })

  it('sin segundo bloque las sucursales siempre quedan en NULL', () => {
    const c = columnas({})

    expect(c).toMatchObject({ hor_sucursal_id: null, hor_sucursal_id_2: null })
  })
})
