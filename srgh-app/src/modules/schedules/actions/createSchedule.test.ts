import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSchedule } from './createSchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ScheduleInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: ScheduleInput = {
  hor_nombre: 'Turno Diurno',
  hor_tipo_jornada_id: 1,
  hor_hora_entrada: '08:00',
  hor_hora_salida: '17:00',
  hor_hora_inicio_almuerzo: '12:00',
  hor_hora_fin_almuerzo: '13:00',
  hor_duracion_almuerzo_min: 60,
  hor_hora_inicio_break: '',
  hor_hora_fin_break: '',
  hor_duracion_break_min: 15,
  hor_activo: true,
}

describe('createSchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos invalidos sin llamar a supabase ni requirePermission', async () => {
    const result = await createSchedule({ ...validInput, hor_nombre: 'ab' })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza cuando la hora de salida no es posterior a la de entrada', async () => {
    const result = await createSchedule({
      ...validInput,
      hor_hora_entrada: '17:00',
      hor_hora_salida: '08:00',
    })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await createSchedule(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: { message: 'duplicate key' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createSchedule(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo crear el horario.' })
  })

  it('crea el horario y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: { hor_id: 42 }, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createSchedule(validInput)

    expect(result).toEqual({ ok: true, id: 42 })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })

  it('guarda la jornada partida con el almuerzo como el hueco entre los bloques', async () => {
    const client = createSupabaseClientMock({
      sgrh_cat_horarios: { data: { hor_id: 43 }, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createSchedule({
      ...validInput,
      hor_hora_salida: '12:00',
      hor_hora_entrada_2: '14:00',
      hor_hora_salida_2: '18:00',
    })

    expect(result).toEqual({ ok: true, id: 43 })
    const builder = client.from.mock.results[0].value as { insert: ReturnType<typeof vi.fn> }
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        hor_empresa_id: 1,
        hor_hora_entrada: '08:00',
        hor_hora_salida: '12:00',
        hor_hora_entrada_2: '14:00',
        hor_hora_salida_2: '18:00',
        hor_hora_inicio_almuerzo: '12:00',
        hor_hora_fin_almuerzo: '14:00',
        hor_duracion_almuerzo_min: 120,
        hor_hora_inicio_break: null,
        hor_hora_fin_break: null,
      })
    )
  })

  it('un horario de un solo bloque se guarda con el segundo bloque en NULL', async () => {
    const client = createSupabaseClientMock({
      sgrh_cat_horarios: { data: { hor_id: 44 }, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    await createSchedule({ ...validInput, hor_hora_entrada_2: '', hor_hora_salida_2: '' })

    const builder = client.from.mock.results[0].value as { insert: ReturnType<typeof vi.fn> }
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ hor_hora_entrada_2: null, hor_hora_salida_2: null })
    )
  })

  it('rechaza un segundo bloque a medias sin tocar la base', async () => {
    const result = await createSchedule({
      ...validInput,
      hor_hora_salida: '12:00',
      hor_hora_entrada_2: '14:00',
      hor_hora_salida_2: '',
    })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  describe('sucursal de cada bloque', () => {
    const conSucursales: ScheduleInput = {
      ...validInput,
      hor_hora_salida: '12:00',
      hor_hora_entrada_2: '14:00',
      hor_hora_salida_2: '18:00',
      hor_sucursal_id: 10,
      hor_sucursal_id_2: 20,
    }

    it('guarda las sucursales de los dos bloques', async () => {
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 10 }, { suc_id: 20 }], error: null },
        sgrh_cat_horarios: { data: { hor_id: 45 }, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await createSchedule(conSucursales)

      expect(result).toEqual({ ok: true, id: 45 })
      const builder = client.from.mock.results[1].value as { insert: ReturnType<typeof vi.fn> }
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ hor_sucursal_id: 10, hor_sucursal_id_2: 20, hor_empresa_id: 1 })
      )
    })

    it('rechaza sucursales que no son de la empresa y no inserta nada', async () => {
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 10 }], error: null },
        sgrh_cat_horarios: { data: { hor_id: 45 }, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await createSchedule(conSucursales)

      expect(result).toEqual({
        ok: false,
        error: 'La sucursal seleccionada no es válida para tu empresa.',
      })
      expect(client.from).not.toHaveBeenCalledWith('sgrh_cat_horarios')
    })

    it('sin sucursales no consulta la tabla de sucursales', async () => {
      const client = createSupabaseClientMock({
        sgrh_cat_horarios: { data: { hor_id: 46 }, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      await createSchedule(validInput)

      expect(client.from).not.toHaveBeenCalledWith('sgrh_sucursales')
    })

    it('rechaza una sola sucursal sin tocar la base', async () => {
      const result = await createSchedule({ ...conSucursales, hor_sucursal_id_2: null })

      expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
      expect(mockCreateClient).not.toHaveBeenCalled()
    })
  })
})
