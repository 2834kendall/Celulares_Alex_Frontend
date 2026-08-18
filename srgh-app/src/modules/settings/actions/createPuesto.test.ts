import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPuesto } from './createPuesto'
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
  pue_nombre: 'Cajero',
  pue_descripcion: 'Atiende caja',
  pue_salario_minimo_referencia: '350000',
  pue_activo: true,
}

describe('createPuesto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza un nombre vacio sin llamar a requirePermission', async () => {
    const result = await createPuesto({ ...validInput, pue_nombre: '' })

    expect(result).toEqual({ ok: false, error: 'Datos de puesto invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await createPuesto(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('acepta salario vacio (sin definir)', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: { pue_id: 5 }, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createPuesto({ ...validInput, pue_salario_minimo_referencia: '' })

    expect(result).toEqual({ ok: true, id: 5 })
  })

  it('devuelve error generico si supabase falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createPuesto(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo crear el puesto.' })
  })

  it('crea el puesto y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: { pue_id: 9 }, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createPuesto(validInput)

    expect(result).toEqual({ ok: true, id: 9 })
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})
