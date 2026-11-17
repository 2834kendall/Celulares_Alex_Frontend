import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pasteWeeklySchedule } from './pasteWeeklySchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { PasteWeeklyScheduleInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const baseInput: PasteWeeklyScheduleInput = {
  employees: [
    {
      employmentHistoryId: 1,
      employeeId: 2,
      days: [
        { assignmentId: null, date: '2026-01-05', branchId: 3, scheduleId: 4, isDayOff: false },
        // Este dia rota a otra sucursal — el caso de uso que motiva el cambio.
        { assignmentId: 10, date: '2026-01-06', branchId: 5, scheduleId: 4, isDayOff: false },
      ],
    },
  ],
}

describe('pasteWeeklySchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza una lista vacia de colaboradores sin llamar a requirePermission', async () => {
    const result = await pasteWeeklySchedule({ employees: [] })

    expect(result).toEqual({ ok: false, error: 'Datos invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('falla si no se pudo determinar la empresa del usuario', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('rechaza si alguna de las sucursales de los dias no es de la empresa', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        // Solo la sucursal 3 pertenece a la empresa; falta la 5 del segundo dia.
        sgrh_sucursales: { data: [{ suc_id: 3 }], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({
      ok: false,
      error: 'La sucursal seleccionada no es válida para tu empresa.',
    })
  })

  it('guarda cada dia con SU propia sucursal (rotacion) y revalida la ruta', async () => {
    const client = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
      sgrh_programacion_semanal: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')

    const calls = client.from.mock.calls
      .map((call, i) =>
        call[0] === 'sgrh_programacion_semanal' ? client.from.mock.results[i].value : null
      )
      .filter((v): v is NonNullable<typeof v> => v !== null)

    expect(calls[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ prg_sucursal_id: 3, prg_fecha: '2026-01-05' })
    )
    expect(calls[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ prg_sucursal_id: 5, prg_fecha: '2026-01-06' })
    )
  })

  it('un dia "sin asignar" en el origen borra la asignacion existente en destino', async () => {
    const client = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 3 }], error: null },
      sgrh_programacion_semanal: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule({
      employees: [
        {
          employmentHistoryId: 1,
          employeeId: 2,
          days: [
            {
              assignmentId: 20,
              date: '2026-01-05',
              branchId: 3,
              scheduleId: null,
              isDayOff: false,
            },
          ],
        },
      ],
    })

    expect(result).toEqual({ ok: true })

    const deleteBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
    )!.value
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.eq).toHaveBeenCalledWith('prg_id', 20)
  })

  it('devuelve error generico si alguna escritura falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: [
          { data: null, error: null },
          { data: null, error: { message: 'boom' } },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo aplicar el horario en todos los dias.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si un dia choca con otro tramo, dice por que en vez del mensaje generico (SGRH-110)', async () => {
    const message =
      'Los tramos del mismo día no pueden traslaparse (09:00 a 13:00 contra 08:00 a 12:00).'
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: [
          { data: null, error: null },
          { data: null, error: { code: '23P01', message } },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: false, error: message })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  describe('varios tramos por dia (SGRH-110)', () => {
    /** Las operaciones sobre la tabla, en el orden en que se lanzaron. */
    function operations(client: ReturnType<typeof createSupabaseClientMock>) {
      return client.from.mock.results
        .map((result, i) => ({ table: client.from.mock.calls[i][0], builder: result.value }))
        .filter(({ table }) => table === 'sgrh_programacion_semanal')
        .map(({ builder }) => {
          const kind = builder.delete.mock.calls.length
            ? 'delete'
            : builder.update.mock.calls.length
              ? 'update'
              : 'insert'
          return { kind, builder }
        })
    }

    const withExtras: PasteWeeklyScheduleInput = {
      employees: [
        {
          employmentHistoryId: 1,
          employeeId: 2,
          days: [
            {
              assignmentId: 10,
              date: '2026-01-05',
              branchId: 3,
              scheduleId: 4,
              isDayOff: false,
              extraTramos: [{ branchId: 5, scheduleId: 6 }],
              replaceTramoIds: [30, 31],
            },
          ],
        },
      ],
    }

    function okClient() {
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: { data: null, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )
      return client
    }

    it('escribe por fases: primero borra los tramos viejos, luego el primero, al final los extra', async () => {
      const client = okClient()

      const result = await pasteWeeklySchedule(withExtras)

      expect(result).toEqual({ ok: true })
      const ops = operations(client)
      expect(ops.map((op) => op.kind)).toEqual(['delete', 'delete', 'update', 'insert'])

      // El primer tramo actualiza SU fila; el extra es una fila nueva en su propia sucursal.
      expect(ops[2].builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ prg_sucursal_id: 3, prg_horario_id: 4 })
      )
      expect(ops[2].builder.eq).toHaveBeenCalledWith('prg_id', 10)
      expect(ops[3].builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          prg_sucursal_id: 5,
          prg_horario_id: 6,
          prg_es_dia_libre: false,
          prg_historial_laboral_id: 1,
          prg_empleado_id: 2,
          prg_fecha: '2026-01-05',
        })
      )
      expect(revalidatePath).toHaveBeenCalledWith('/schedule')
    })

    it('borra los tramos viejos solo si son de ese colaborador y ese dia', async () => {
      const client = okClient()

      await pasteWeeklySchedule(withExtras)

      const [firstDelete, secondDelete] = operations(client)
      expect(firstDelete.builder.eq).toHaveBeenCalledWith('prg_id', 30)
      expect(secondDelete.builder.eq).toHaveBeenCalledWith('prg_id', 31)
      for (const { builder } of [firstDelete, secondDelete]) {
        expect(builder.eq).toHaveBeenCalledWith('prg_historial_laboral_id', 1)
        expect(builder.eq).toHaveBeenCalledWith('prg_fecha', '2026-01-05')
      }
    })

    it('un tramo extra a medida se guarda con sus horas y sin horario de catalogo', async () => {
      const client = okClient()

      const result = await pasteWeeklySchedule({
        employees: [
          {
            employmentHistoryId: 1,
            employeeId: 2,
            days: [
              {
                assignmentId: null,
                date: '2026-01-05',
                branchId: 3,
                scheduleId: 4,
                isDayOff: false,
                extraTramos: [
                  {
                    branchId: 5,
                    scheduleId: null,
                    customStartTime: '13:00',
                    customEndTime: '17:00',
                  },
                ],
              },
            ],
          },
        ],
      })

      expect(result).toEqual({ ok: true })
      const inserts = operations(client).filter((op) => op.kind === 'insert')
      expect(inserts).toHaveLength(2)
      expect(inserts[1].builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          prg_sucursal_id: 5,
          prg_horario_id: null,
          prg_hora_entrada_custom: '13:00',
          prg_hora_salida_custom: '17:00',
        })
      )
    })

    it('un dia "sin asignar" en el origen tambien borra los tramos extra del destino', async () => {
      // Solo se usa la sucursal 3: la comprobacion espera exactamente las sucursales usadas.
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }], error: null },
        sgrh_programacion_semanal: { data: null, error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await pasteWeeklySchedule({
        employees: [
          {
            employmentHistoryId: 1,
            employeeId: 2,
            days: [
              {
                assignmentId: 20,
                date: '2026-01-05',
                branchId: 3,
                scheduleId: null,
                isDayOff: false,
                replaceTramoIds: [21],
              },
            ],
          },
        ],
      })

      expect(result).toEqual({ ok: true })
      const ops = operations(client)
      expect(ops.map((op) => op.kind)).toEqual(['delete', 'delete'])
      expect(ops[0].builder.eq).toHaveBeenCalledWith('prg_id', 20)
      expect(ops[1].builder.eq).toHaveBeenCalledWith('prg_id', 21)
    })

    it('si falla el borrado no escribe nada mas ni revalida', async () => {
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: [
          { data: null, error: { message: 'boom' } },
          { data: null, error: null },
        ],
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await pasteWeeklySchedule(withExtras)

      expect(result).toEqual({
        ok: false,
        error: 'No se pudo aplicar el horario en todos los dias.',
      })
      // Las dos bajas salen juntas (misma fase); despues no se escribe el primer tramo ni el extra.
      expect(operations(client).map((op) => op.kind)).toEqual(['delete', 'delete'])
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('si el primer tramo choca, no agrega los extra y explica por que', async () => {
      const message =
        'Los tramos del mismo día no pueden traslaparse (08:00 a 12:00 contra 09:00 a 13:00).'
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: { data: null, error: { code: '23P01', message } },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await pasteWeeklySchedule({
        employees: [
          {
            employmentHistoryId: 1,
            employeeId: 2,
            days: [
              {
                ...withExtras.employees[0].days[0],
                replaceTramoIds: undefined,
              },
            ],
          },
        ],
      })

      expect(result).toEqual({ ok: false, error: message })
      expect(operations(client).map((op) => op.kind)).toEqual(['update'])
    })

    it('si un tramo extra choca, devuelve el motivo', async () => {
      const message =
        'Los tramos del mismo día no pueden traslaparse (13:00 a 17:00 contra 12:00 a 14:00).'
      const client = createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: [
          { data: null, error: null },
          { data: null, error: { code: '23P01', message } },
        ],
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await pasteWeeklySchedule({
        employees: [
          {
            employmentHistoryId: 1,
            employeeId: 2,
            days: [{ ...withExtras.employees[0].days[0], replaceTramoIds: undefined }],
          },
        ],
      })

      expect(result).toEqual({ ok: false, error: message })
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('valida tambien la sucursal de los tramos extra', async () => {
      mockCreateClient.mockResolvedValue(
        createSupabaseClientMock({
          // La sucursal 5 del tramo extra no es de la empresa.
          sgrh_sucursales: { data: [{ suc_id: 3 }], error: null },
        }) as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await pasteWeeklySchedule(withExtras)

      expect(result).toEqual({
        ok: false,
        error: 'La sucursal seleccionada no es válida para tu empresa.',
      })
    })

    it('rechaza un dia libre con tramos extra', async () => {
      const result = await pasteWeeklySchedule({
        employees: [
          {
            employmentHistoryId: 1,
            employeeId: 2,
            days: [
              {
                assignmentId: null,
                date: '2026-01-05',
                branchId: 3,
                scheduleId: null,
                isDayOff: true,
                extraTramos: [{ branchId: 5, scheduleId: 6 }],
              },
            ],
          },
        ],
      })

      expect(result).toEqual({ ok: false, error: 'Datos invalidos.' })
      expect(mockRequirePermission).not.toHaveBeenCalled()
    })

    it('rechaza un tramo extra sin horario', async () => {
      const result = await pasteWeeklySchedule({
        employees: [
          {
            employmentHistoryId: 1,
            employeeId: 2,
            days: [
              {
                assignmentId: null,
                date: '2026-01-05',
                branchId: 3,
                scheduleId: 4,
                isDayOff: false,
                extraTramos: [{ branchId: 5, scheduleId: null }],
              },
            ],
          },
        ],
      })

      expect(result).toEqual({ ok: false, error: 'Datos invalidos.' })
    })
  })
})
