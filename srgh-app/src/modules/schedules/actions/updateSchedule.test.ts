import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSchedule } from './updateSchedule'
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

describe('updateSchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza datos invalidos sin llamar a requirePermission', async () => {
    const result = await updateSchedule(1, { ...validInput, hor_nombre: 'ab' })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('devuelve error generico si supabase falla al actualizar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: { message: 'not found' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSchedule(1, validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el horario.' })
  })

  it('actualiza el horario y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSchedule(1, validInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })

  it('actualiza a jornada partida: segundo bloque y almuerzo como el hueco', async () => {
    const client = createSupabaseClientMock({ sgrh_cat_horarios: { data: null, error: null } })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSchedule(9, {
      ...validInput,
      hor_hora_salida: '11:00',
      hor_hora_entrada_2: '16:00',
      hor_hora_salida_2: '20:00',
      hor_hora_inicio_break: '10:00',
      hor_hora_fin_break: '10:10',
    })

    expect(result).toEqual({ ok: true })
    const builder = client.from.mock.results[0].value as { update: ReturnType<typeof vi.fn> }
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        hor_hora_entrada_2: '16:00',
        hor_hora_salida_2: '20:00',
        hor_hora_inicio_almuerzo: '11:00',
        hor_hora_fin_almuerzo: '16:00',
        hor_duracion_almuerzo_min: 300,
        hor_hora_inicio_break: null,
        hor_hora_fin_break: null,
      })
    )
  })

  it('quitar el segundo bloque manda NULL en las dos columnas', async () => {
    const client = createSupabaseClientMock({ sgrh_cat_horarios: { data: null, error: null } })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    await updateSchedule(9, { ...validInput, hor_hora_entrada_2: '', hor_hora_salida_2: '' })

    const builder = client.from.mock.results[0].value as { update: ReturnType<typeof vi.fn> }
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ hor_hora_entrada_2: null, hor_hora_salida_2: null })
    )
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

    beforeEach(() => {
      mockRequirePermission.mockResolvedValue({
        app_metadata: { empresa_id: 1 },
      } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    })

    it('guarda las sucursales de los dos bloques', async () => {
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 10 }, { suc_id: 20 }], error: null },
        sgrh_cat_horarios: { data: null, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await updateSchedule(9, conSucursales)

      expect(result).toEqual({ ok: true })
      const builder = client.from.mock.results[1].value as { update: ReturnType<typeof vi.fn> }
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ hor_sucursal_id: 10, hor_sucursal_id_2: 20 })
      )
    })

    it('rechaza sucursales que no son de la empresa y no actualiza nada', async () => {
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [], error: null },
        sgrh_cat_horarios: { data: null, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await updateSchedule(9, conSucursales)

      expect(result).toEqual({
        ok: false,
        error: 'La sucursal seleccionada no es válida para tu empresa.',
      })
      expect(client.from).not.toHaveBeenCalledWith('sgrh_cat_horarios')
    })

    it('falla si hay sucursales pero no se conoce la empresa', async () => {
      mockRequirePermission.mockResolvedValue({
        app_metadata: {},
      } as unknown as Awaited<ReturnType<typeof requirePermission>>)
      mockCreateClient.mockResolvedValue(
        createSupabaseClientMock({}) as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await updateSchedule(9, conSucursales)

      expect(result).toEqual({
        ok: false,
        error: 'No se pudo determinar la empresa del usuario.',
      })
    })

    it('quitar el segundo bloque limpia tambien las sucursales', async () => {
      const client = createSupabaseClientMock({ sgrh_cat_horarios: { data: null, error: null } })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      await updateSchedule(9, { ...validInput, hor_hora_entrada_2: '', hor_hora_salida_2: '' })

      const builder = client.from.mock.results[0].value as { update: ReturnType<typeof vi.fn> }
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ hor_sucursal_id: null, hor_sucursal_id_2: null })
      )
    })
  })
})
