import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updatePuesto } from './updatePuesto'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { PuestoInput } from '@/modules/settings/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: PuestoInput = {
  pue_nombre: 'Cajero senior',
  pue_descripcion: '',
  pue_salario_minimo_referencia: '',
  pue_activo: false,
}

describe('updatePuesto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un nombre de un solo caracter sin llamar a requirePermission', async () => {
    const result = await updatePuesto(1, { ...validInput, pue_nombre: 'C' })

    expect(result).toEqual({ ok: false, error: 'Datos de puesto invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('devuelve error generico si supabase falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updatePuesto(1, validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el puesto.' })
  })

  it('actualiza el puesto (incluye desactivarlo) y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updatePuesto(1, validInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})
