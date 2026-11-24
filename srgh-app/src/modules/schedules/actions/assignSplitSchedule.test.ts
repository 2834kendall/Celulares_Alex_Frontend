import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignSplitSchedule } from './assignSplitSchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { AssignSplitScheduleInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const input: AssignSplitScheduleInput = {
  assignmentId: 50,
  employmentHistoryId: 1,
  employeeId: 2,
  date: '2026-01-06',
  scheduleId: 8,
}

const partida = {
  hor_hora_entrada: '07:00:00',
  hor_hora_salida: '11:00:00',
  hor_hora_entrada_2: '16:00:00',
  hor_hora_salida_2: '20:00:00',
  hor_sucursal_id: 10,
  hor_sucursal_id_2: 20,
}

type Result = { data: unknown; error: unknown }

function mockClient(options: {
  sucursales?: Result
  horario?: Result
  programacion?: Result | Result[]
}) {
  const client = createSupabaseClientMock({
    sgrh_sucursales: options.sucursales ?? { data: [{ suc_id: 10 }, { suc_id: 20 }], error: null },
    sgrh_cat_horarios: options.horario ?? { data: partida, error: null },
    sgrh_programacion_semanal: options.programacion ?? { data: null, error: null },
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Los constructores que devolvio from(tabla), en orden de llamada. */
function buildersOf(client: ReturnType<typeof mockClient>, table: string) {
  return client.from.mock.calls
    .map((call, index) => ({ table: call[0], builder: client.from.mock.results[index].value }))
    .filter((c) => c.table === table)
    .map((c) => c.builder as Record<string, ReturnType<typeof vi.fn>>)
}

describe('assignSplitSchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos invalidos sin tocar permisos ni base', async () => {
    const result = await assignSplitSchedule({ ...input, scheduleId: 0 })

    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('falla si no se pudo determinar la empresa', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    expect(await assignSplitSchedule(input)).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('rechaza sucursales de la plantilla que no son de la empresa', async () => {
    mockClient({ sucursales: { data: [{ suc_id: 10 }], error: null } })

    expect(await assignSplitSchedule(input)).toEqual({
      ok: false,
      error: 'La sucursal seleccionada no es válida para tu empresa.',
    })
  })

  it.each([
    ['sin sucursales', { hor_sucursal_id: null, hor_sucursal_id_2: null }],
    ['con la misma sucursal en los dos bloques', { hor_sucursal_id: 10, hor_sucursal_id_2: 10 }],
  ])('rechaza una plantilla %s: no hay nada que repartir', async (_nombre, sucursales) => {
    const client = mockClient({ horario: { data: { ...partida, ...sucursales }, error: null } })

    expect(await assignSplitSchedule(input)).toEqual({
      ok: false,
      error: 'El horario no reparte sus bloques entre sucursales distintas.',
    })
    expect(buildersOf(client, 'sgrh_programacion_semanal')).toHaveLength(0)
  })

  it('falla si el horario no existe en la empresa', async () => {
    mockClient({ horario: { data: null, error: null } })

    expect(await assignSplitSchedule(input)).toEqual({
      ok: false,
      error: 'No se encontró el horario seleccionado.',
    })
  })

  it('rechaza una plantilla de un solo bloque', async () => {
    mockClient({
      horario: {
        data: { ...partida, hor_hora_entrada_2: null, hor_hora_salida_2: null },
        error: null,
      },
    })

    expect(await assignSplitSchedule(input)).toEqual({
      ok: false,
      error: 'El horario seleccionado no es una jornada partida.',
    })
  })

  it('guarda dos tramos con las sucursales de la plantilla: el primero reemplaza la fila existente y el segundo es nuevo', async () => {
    const client = mockClient({})

    const result = await assignSplitSchedule(input)

    expect(result).toEqual({ ok: true })
    const [primero, segundo] = buildersOf(client, 'sgrh_programacion_semanal')
    expect(primero.update).toHaveBeenCalledWith(
      expect.objectContaining({
        prg_sucursal_id: 10,
        prg_horario_id: 8,
        prg_fecha: '2026-01-06',
        prg_es_dia_libre: false,
        prg_hora_entrada_custom: '07:00',
        prg_hora_salida_custom: '11:00',
        prg_hora_inicio_almuerzo_custom: null,
      })
    )
    expect(primero.eq).toHaveBeenCalledWith('prg_id', 50)
    expect(segundo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        prg_sucursal_id: 20,
        prg_horario_id: 8,
        prg_hora_entrada_custom: '16:00',
        prg_hora_salida_custom: '20:00',
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })

  it('sin fila previa inserta los dos bloques', async () => {
    const client = mockClient({})

    await assignSplitSchedule({ ...input, assignmentId: null })

    const [primero, segundo] = buildersOf(client, 'sgrh_programacion_semanal')
    expect(primero.insert).toHaveBeenCalledTimes(1)
    expect(segundo.insert).toHaveBeenCalledTimes(1)
  })

  it('si falla el primer bloque no escribe el segundo', async () => {
    const client = mockClient({
      programacion: {
        data: null,
        error: {
          code: '23P01',
          message:
            'Los tramos del mismo día no pueden traslaparse (07:00 a 11:00 contra 08:00 a 17:00).',
        },
      },
    })

    const result = await assignSplitSchedule(input)

    expect(result).toEqual({
      ok: false,
      error: 'Los tramos del mismo día no pueden traslaparse (07:00 a 11:00 contra 08:00 a 17:00).',
    })
    expect(buildersOf(client, 'sgrh_programacion_semanal')).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si falla el segundo bloque avisa que el primero ya quedo guardado', async () => {
    mockClient({
      programacion: [
        { data: null, error: null },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
      ],
    })

    const result = await assignSplitSchedule(input)

    expect(result).toEqual({
      ok: false,
      error:
        'Se guardó el primer bloque, pero no el segundo. Este colaborador ya tiene un tramo en esa sucursal ese día. Edítalo en lugar de agregar otro.',
    })
    // El primero quedo escrito: la pantalla debe refrescarse.
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })
})
