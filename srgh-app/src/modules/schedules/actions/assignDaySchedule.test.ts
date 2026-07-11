import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignDaySchedule } from './assignDaySchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { AssignDayInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const baseInput: AssignDayInput = {
  assignmentId: null,
  employmentHistoryId: 1,
  employeeId: 2,
  branchId: 3,
  date: '2026-01-05',
  scheduleId: null,
  isDayOff: false,
}

function mockSupabaseSuccess() {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_programacion_semanal: { data: null, error: null },
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('assignDaySchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza una fecha con formato invalido sin llamar a requirePermission', async () => {
    const result = await assignDaySchedule({ ...baseInput, date: '05-01-2026' })

    expect(result).toEqual({ ok: false, error: 'Datos de asignacion invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige un horario, dia libre, u horas personalizadas', async () => {
    const result = await assignDaySchedule(baseInput)

    expect(result).toEqual({
      ok: false,
      error:
        'Debe seleccionar un horario, definir uno personalizado, o marcar el dia como descanso.',
    })
  })

  it('rechaza horas personalizadas donde la salida no es posterior a la entrada', async () => {
    const result = await assignDaySchedule({
      ...baseInput,
      customStartTime: '17:00',
      customEndTime: '08:00',
    })

    expect(result).toEqual({
      ok: false,
      error: 'La hora de salida debe ser posterior a la hora de entrada.',
    })
  })

  it('rechaza un almuerzo personalizado invertido', async () => {
    const result = await assignDaySchedule({
      ...baseInput,
      customStartTime: '08:00',
      customEndTime: '17:00',
      customLunchStart: '13:00',
      customLunchEnd: '12:00',
    })

    expect(result).toEqual({
      ok: false,
      error: 'El fin del almuerzo debe ser posterior al inicio.',
    })
  })

  it('rechaza un break personalizado invertido', async () => {
    const result = await assignDaySchedule({
      ...baseInput,
      customStartTime: '08:00',
      customEndTime: '17:00',
      customBreakStart: '10:15',
      customBreakEnd: '10:00',
    })

    expect(result).toEqual({
      ok: false,
      error: 'El fin del break debe ser posterior al inicio.',
    })
  })

  it('marca el dia como libre (insert cuando no hay assignmentId)', async () => {
    mockSupabaseSuccess()

    const result = await assignDaySchedule({ ...baseInput, isDayOff: true })

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })

  it('asigna un horario existente por id', async () => {
    mockSupabaseSuccess()

    const result = await assignDaySchedule({ ...baseInput, scheduleId: 4 })

    expect(result).toEqual({ ok: true })
  })

  it('guarda horas personalizadas validas', async () => {
    mockSupabaseSuccess()

    const result = await assignDaySchedule({
      ...baseInput,
      customStartTime: '08:00',
      customEndTime: '17:00',
      customLunchStart: '12:00',
      customLunchEnd: '13:00',
    })

    expect(result).toEqual({ ok: true })
  })

  it('actualiza (update) cuando ya existe un assignmentId', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await assignDaySchedule({ ...baseInput, assignmentId: 99, scheduleId: 4 })

    expect(result).toEqual({ ok: true })
  })

  it('devuelve error generico si supabase falla al guardar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await assignDaySchedule({ ...baseInput, scheduleId: 4 })

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la asignacion.' })
  })
})
