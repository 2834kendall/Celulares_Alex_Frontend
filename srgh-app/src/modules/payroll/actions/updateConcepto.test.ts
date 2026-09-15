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

/**
 * Primero se lee el concepto que se va a tocar (para saber si es el BASE, que
 * está protegido) y después se escribe. La cola del mock respeta ese orden.
 */
function mockUpdate(result: { data: unknown; error: unknown }, codigoActual = 'CCSS_OBRERA') {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_cat_conceptos_nomina: [{ data: { con_codigo: codigoActual }, error: null }, result],
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

const BASE_VALIDO: ConceptoNominaInput = {
  con_codigo: 'BASE',
  con_nombre: 'Salario base',
  con_tipo: 'ingreso',
  con_tipo_calculo: 'monto_manual_ingreso',
  con_porcentaje: null,
  con_afecta_salario_bruto: true,
  con_afecta_base_ccss: true,
  con_formula_base: null,
  con_activo: true,
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
  // Mismo motivo que en createConcepto: activar un concepto de horas extra
  // automaticas hace que el excedente se pague en la planilla Y quede
  // pendiente en el banco de horas.
  it('no deja activar un concepto de horas extra automáticas', async () => {
    mockUpdate({ data: null, error: null })

    const result = await updateConcepto(4, {
      ...INPUT,
      con_tipo_calculo: 'horas_extra_automatico',
      con_porcentaje: 150,
      con_activo: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('dos veces')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  // El motor escribe el salario de la quincena en el concepto de código BASE y
  // lo recoge buscándolo por ese código. Romper cualquiera de las condiciones
  // que necesita dejaba la planilla en ₡0 con las horas correctas, sin error.
  describe('protege el concepto BASE', () => {
    it.each([
      ['desactivarlo', { con_activo: false }],
      ['cambiarle el código', { con_codigo: 'SALARIO' }],
      ['volverlo deducción', { con_tipo: 'deduccion' as const }],
      [
        'volverlo un porcentaje',
        { con_tipo_calculo: 'porcentaje_deduccion_bruto' as const, con_porcentaje: 10 },
      ],
      ['sacarlo del salario bruto', { con_afecta_salario_bruto: false }],
    ])('no deja %s', async (_caso, cambio) => {
      mockUpdate({ data: null, error: null }, 'BASE')

      const result = await updateConcepto(21, { ...BASE_VALIDO, ...cambio })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('₡0')
    })

    it('sí deja cambiarle el nombre visible', async () => {
      mockUpdate({ data: null, error: null }, 'BASE')

      const result = await updateConcepto(21, {
        ...BASE_VALIDO,
        con_nombre: 'Salario base quincenal',
      })

      expect(result).toEqual({ ok: true })
    })
  })
})
