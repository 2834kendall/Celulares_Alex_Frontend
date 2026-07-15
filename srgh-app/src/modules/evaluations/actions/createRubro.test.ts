import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRubro } from './createRubro'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { RubroInput } from '@/modules/evaluations/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: RubroInput = {
  nombre: 'Proactividad en Tienda',
  descripcion: 'Iniciativa para resolver situaciones sin supervision.',
}

describe('createRubro (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un nombre demasiado corto sin llamar a requirePermission', async () => {
    const result = await createRubro({ ...validInput, nombre: 'ab' })

    expect(result).toEqual({ ok: false, error: 'Datos del rubro invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('devuelve error de nombre repetido si el area falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_areas_evaluacion: { data: null, error: { message: 'duplicate key' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createRubro(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo crear el rubro. Verifique que el nombre no este repetido.',
    })
  })

  it('revierte el area si el criterio no se puede guardar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_areas_evaluacion: { data: { are_id: 3 }, error: null },
        sgrh_cat_criterios_evaluacion: { data: null, error: { message: 'fk violation' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createRubro(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la descripcion del rubro.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('crea el rubro (area + criterio) y revalida la ruta', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_areas_evaluacion: { data: { are_id: 7 }, error: null },
        sgrh_cat_criterios_evaluacion: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createRubro(validInput)

    expect(result).toEqual({ ok: true, id: 7 })
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations')
  })
})
