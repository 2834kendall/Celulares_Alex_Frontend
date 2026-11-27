import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getScheduleSuggestion } from './getScheduleSuggestion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

// Lunes (los lunes de diciembre de 2025), de mas reciente a mas antiguo.
const MONDAYS = ['2025-12-29', '2025-12-22', '2025-12-15', '2025-12-08', '2025-12-01']
const TUESDAY = '2025-12-30'

interface RowOptions {
  employmentHistoryId?: number
  branchId?: number
  scheduleId?: number | null
  start?: string | null
  dayOff?: boolean
  custom?: string | null
}

function row(fecha: string, options: RowOptions = {}) {
  const { scheduleId = 1, start = '08:00:00' } = options
  return {
    prg_historial_laboral_id: options.employmentHistoryId ?? 1,
    prg_fecha: fecha,
    prg_sucursal_id: options.branchId ?? 100,
    prg_es_dia_libre: options.dayOff ?? false,
    prg_horario_id: options.dayOff ? null : scheduleId,
    prg_hora_entrada_custom: options.custom ?? null,
    sgrh_cat_horarios: scheduleId != null && !options.dayOff ? { hor_hora_entrada: start } : null,
  }
}

async function suggest(data: unknown[], ids = [1]) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_programacion_semanal: { data, error: null },
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return getScheduleSuggestion(ids, '2026-01-05')
}

/** Lo sugerido para un colaborador en un dia de la semana (lunes=0). */
function suggestedFor(
  result: Awaited<ReturnType<typeof getScheduleSuggestion>>,
  employmentHistoryId = 1,
  weekday = 0
) {
  if (!result.ok) throw new Error(result.error)
  return result.byEmployment[employmentHistoryId][weekday]
}

describe('getScheduleSuggestion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('sin colaboradores devuelve un resultado vacio sin consultar nada', async () => {
    const result = await getScheduleSuggestion([], '2026-01-05')

    expect(result).toEqual({ ok: true, byEmployment: {} })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza una fecha invalida', async () => {
    const result = await getScheduleSuggestion([1], 'no-es-fecha')

    expect(result).toEqual({ ok: false, error: 'Fecha inválida.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('devuelve error si falla la consulta del historial', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getScheduleSuggestion([1], '2026-01-05')

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo cargar el historial de horarios.',
    })
  })

  it('sin historial sugiere nada para los 7 dias', async () => {
    const result = await suggest([])

    expect(result).toEqual({ ok: true, byEmployment: { 1: Array(7).fill(null) } })
  })

  describe('un tramo por dia', () => {
    it('sugiere por dia de la semana el horario que mas se repite, sin opinar de sucursal', async () => {
      const result = await suggest([
        row(MONDAYS[0], { scheduleId: 2, branchId: 300 }),
        row(MONDAYS[1], { scheduleId: 1 }),
        row(MONDAYS[2], { scheduleId: 1 }),
        row(TUESDAY, { scheduleId: 3 }),
      ])

      expect(result).toEqual({
        ok: true,
        byEmployment: {
          1: [
            { scheduleId: 1, isDayOff: false },
            { scheduleId: 3, isDayOff: false },
            null,
            null,
            null,
            null,
            null,
          ],
        },
      })
    })

    it('el descanso cuenta como una opcion mas y puede ser la mas frecuente', async () => {
      const result = await suggest([
        row(MONDAYS[0], { dayOff: true }),
        row(MONDAYS[1], { dayOff: true }),
        row(MONDAYS[2], { scheduleId: 1 }),
      ])

      expect(suggestedFor(result)).toEqual({ scheduleId: null, isDayOff: true })
    })

    it('ante un empate gana lo mas reciente', async () => {
      const result = await suggest([
        row(MONDAYS[0], { scheduleId: 2 }),
        row(MONDAYS[1], { scheduleId: 1 }),
      ])

      expect(suggestedFor(result)).toEqual({ scheduleId: 2, isDayOff: false })
    })

    it('un dia con horas a medida no vota', async () => {
      const result = await suggest([
        row(MONDAYS[0], { scheduleId: 1, custom: '09:30:00' }),
        row(MONDAYS[1], { scheduleId: 2 }),
      ])

      expect(suggestedFor(result)).toEqual({ scheduleId: 2, isDayOff: false })
    })

    it('una fila sin horario ni descanso ni horas a medida no cuenta', async () => {
      const result = await suggest([row(MONDAYS[0], { scheduleId: null })])

      expect(result).toEqual({ ok: true, byEmployment: { 1: Array(7).fill(null) } })
    })

    it('separa a cada colaborador', async () => {
      const result = await suggest(
        [
          row(MONDAYS[0], { employmentHistoryId: 1, scheduleId: 1 }),
          row(MONDAYS[0], { employmentHistoryId: 2, scheduleId: 2 }),
        ],
        [1, 2, 3]
      )

      expect(suggestedFor(result, 1)).toEqual({ scheduleId: 1, isDayOff: false })
      expect(suggestedFor(result, 2)).toEqual({ scheduleId: 2, isDayOff: false })
      expect(suggestedFor(result, 3)).toBeNull()
    })
  })

  describe('varios tramos por dia (SGRH-110)', () => {
    // Manana (horario 1, 8:00) en la 100 y tarde (horario 2, 13:00) en la 200.
    function twoTramoDay(fecha: string, extra: Partial<RowOptions> = {}) {
      return [
        row(fecha, { scheduleId: 2, start: '13:00:00', branchId: 200, ...extra }),
        row(fecha, { scheduleId: 1, start: '08:00:00', branchId: 100, ...extra }),
      ]
    }

    it('sugiere los dos tramos con su sucursal, el que empieza antes primero', async () => {
      const result = await suggest(twoTramoDay(MONDAYS[0]))

      expect(result).toEqual({
        ok: true,
        byEmployment: {
          1: [
            {
              scheduleId: 1,
              isDayOff: false,
              branchId: 100,
              extraTramos: [{ scheduleId: 2, isDayOff: false, branchId: 200 }],
            },
            null,
            null,
            null,
            null,
            null,
            null,
          ],
        },
      })
    })

    it('un dia de dos tramos vota como un dia completo: con un solo lunes no le gana a dos lunes de un tramo', async () => {
      const result = await suggest([
        ...twoTramoDay(MONDAYS[0]),
        row(MONDAYS[1], { scheduleId: 1 }),
        row(MONDAYS[2], { scheduleId: 1 }),
      ])

      // Un solo tramo: sin sucursal ni tramos extra.
      expect(suggestedFor(result)).toEqual({ scheduleId: 1, isDayOff: false })
    })

    it('el patron de dos tramos gana cuando es lo que mas se repite', async () => {
      const result = await suggest([
        ...twoTramoDay(MONDAYS[0]),
        ...twoTramoDay(MONDAYS[1]),
        row(MONDAYS[2], { scheduleId: 1 }),
      ])

      expect(suggestedFor(result)).toEqual({
        scheduleId: 1,
        isDayOff: false,
        branchId: 100,
        extraTramos: [{ scheduleId: 2, isDayOff: false, branchId: 200 }],
      })
    })

    it('la misma pareja de horarios en otras sucursales es otro patron', async () => {
      const result = await suggest([
        ...twoTramoDay(MONDAYS[0], {}),
        // Mismos horarios pero la manana en la 200 y la tarde en la 100.
        row(MONDAYS[1], { scheduleId: 1, start: '08:00:00', branchId: 200 }),
        row(MONDAYS[1], { scheduleId: 2, start: '13:00:00', branchId: 100 }),
        row(MONDAYS[2], { scheduleId: 1, start: '08:00:00', branchId: 200 }),
        row(MONDAYS[2], { scheduleId: 2, start: '13:00:00', branchId: 100 }),
      ])

      expect(suggestedFor(result)).toEqual({
        scheduleId: 1,
        isDayOff: false,
        branchId: 200,
        extraTramos: [{ scheduleId: 2, isDayOff: false, branchId: 100 }],
      })
    })

    it('un dia con un tramo a medida no vota, aunque el otro sea de catalogo', async () => {
      const result = await suggest([
        row(MONDAYS[0], { scheduleId: 1, start: '08:00:00', branchId: 100 }),
        row(MONDAYS[0], {
          scheduleId: null,
          start: null,
          branchId: 200,
          custom: '13:00:00',
        }),
      ])

      expect(result).toEqual({ ok: true, byEmployment: { 1: Array(7).fill(null) } })
    })

    it('un descanso junto a otros tramos (dato incoherente) no vota', async () => {
      const result = await suggest([
        row(MONDAYS[0], { dayOff: true }),
        row(MONDAYS[0], { scheduleId: 1, branchId: 200 }),
      ])

      expect(result).toEqual({ ok: true, byEmployment: { 1: Array(7).fill(null) } })
    })

    it('si el historial llego al tope, descarta el dia mas antiguo que pudo quedar cortado', async () => {
      // 4999 filas de relleno de otro colaborador + 1 fila del mas antiguo (solo
      // se leyo un tramo de un dia que tiene dos): no debe sugerir un dia a medias.
      const filler = Array.from({ length: 4999 }, () =>
        row('2025-12-29', { employmentHistoryId: 99, scheduleId: 9 })
      )
      const result = await suggest([...filler, row(MONDAYS[4], { scheduleId: 1 })])

      expect(result).toEqual({ ok: true, byEmployment: { 1: Array(7).fill(null) } })
    })
  })
})
