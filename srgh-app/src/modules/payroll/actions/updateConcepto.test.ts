import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateConcepto } from './updateConcepto'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ConceptoNominaInput } from '@/modules/payroll/types'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const INPUT: ConceptoNominaInput = {
  con_codigo: 'CCSS_OBRERA',
  con_nombre: 'Rebajo CCSS',
  con_tipo: 'deduccion',
  con_tipo_calculo: 'porcentaje_deduccion_bruto',
  con_porcentaje: 10.83,
  con_afecta_salario_bruto: false,
  con_afecta_base_ccss: false,
  con_formula_base: null,
  con_activo: true,
}

function mockUpdate(result: { data: unknown; error: unknown }) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({ sgrh_cat_conceptos_nomina: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

describe('updateConcepto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza datos inválidos sin tocar la base', async () => {
    const result = await updateConcepto(1, { ...INPUT, con_nombre: '' })

    expect(result).toEqual({ ok: false, error: 'Datos del concepto inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('actualiza un concepto precargado (p. ej. CCSS_OBRERA) igual que uno nuevo', async () => {
    mockUpdate({ data: null, error: null })

    const result = await updateConcepto(6, INPUT)

    expect(result).toEqual({ ok: true })
  })

  it('traduce el código duplicado (23505) a un mensaje claro', async () => {
    mockUpdate({ data: null, error: { code: '23505', message: 'duplicate' } })

    const result = await updateConcepto(6, INPUT)

    expect(result).toEqual({ ok: false, error: 'Ya existe un concepto con ese código.' })
  })
})
