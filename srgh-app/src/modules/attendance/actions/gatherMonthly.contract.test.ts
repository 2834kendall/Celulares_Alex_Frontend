import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkMonthlyInfractions } from './checkMonthlyInfractions'
import { getMonthlyAttendanceSummary } from './getMonthlyAttendanceSummary'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { gatherMonthlyAttendanceDays } from '@/modules/attendance/lib/monthlySummary'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'error',
  getFiltroMarca: vi.fn(),
}))
vi.mock('@/modules/attendance/lib/monthlySummary', () => ({
  gatherMonthlyAttendanceDays: vi.fn(),
}))

/*
 * React.cache distingue por cantidad de argumentos, y en Vitest no memoiza: ningún
 * otro test notaría que las dos acciones dejaron de compartir las ~7 consultas del
 * mes. Por eso se fija lo único que se puede fijar acá: los argumentos.
 */
describe('las dos acciones que comparten gatherMonthlyAttendanceDays', () => {
  const llamadas = () => vi.mocked(gatherMonthlyAttendanceDays).mock.calls

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({} as never)
    vi.mocked(requirePermission).mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 999 },
    } as never)
    vi.mocked(gatherMonthlyAttendanceDays).mockResolvedValue({ ok: true, data: [], tipos: [] })
  })

  it('sin filtro llaman con los mismos seis argumentos, y comparten resultado', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValue({ estado: 'sin-filtro', sucursalIds: null })

    await checkMonthlyInfractions()
    await getMonthlyAttendanceSummary({ fecha: todayInCostaRica() })

    expect(llamadas()).toHaveLength(2)
    expect(llamadas()[0]).toHaveLength(6)
    expect(llamadas()[0]).toEqual(llamadas()[1])
  })

  it('con una marca elegida, la advertencia del mes sigue contando todo', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValue({
      estado: 'filtrado',
      marcaId: 1,
      sucursalIds: [5, 6],
    })

    await checkMonthlyInfractions()
    await getMonthlyAttendanceSummary({ fecha: todayInCostaRica() })

    expect(llamadas()[0][5]).toBeNull()
    expect(llamadas()[1][5]).toEqual([5, 6])
  })
})
