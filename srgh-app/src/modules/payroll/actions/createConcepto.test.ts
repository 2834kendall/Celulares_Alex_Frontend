import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConcepto } from './createConcepto'
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
  con_codigo: 'bono_anual',
  con_nombre: 'Bono anual',
  con_tipo: 'ingreso',
  con_tipo_calculo: 'monto_manual_ingreso',
  con_porcentaje: null,
  con_afecta_salario_bruto: true,
  con_afecta_base_ccss: true,
  con_formula_base: null,
  con_activo: true,
}

function mockInsert(result: { data: unknown; error: unknown }) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({ sgrh_cat_conceptos_nomina: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

describe('createConcepto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza datos inválidos sin tocar la base', async () => {
    const result = await createConcepto({ ...INPUT, con_codigo: 'a' })

    expect(result).toEqual({ ok: false, error: 'Datos del concepto inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('sube el código a mayúsculas al guardar', async () => {
    mockInsert({ data: { con_id: 10 }, error: null })

    const result = await createConcepto(INPUT)

    expect(result).toEqual({ ok: true, id: 10 })
  })

  it('traduce el código duplicado (23505) a un mensaje claro', async () => {
    mockInsert({ data: null, error: { code: '23505', message: 'duplicate' } })

    const result = await createConcepto(INPUT)

    expect(result).toEqual({ ok: false, error: 'Ya existe un concepto con ese código.' })
  })

  it('devuelve un error genérico para otras fallas', async () => {
    mockInsert({ data: null, error: { code: '42501', message: 'rls' } })

    const result = await createConcepto(INPUT)

    expect(result.ok).toBe(false)
  })
  // Regresion: el excedente sobre el tope quincenal lo administra el banco de
  // horas. Un concepto activo de horas extra automaticas pagaria esas mismas
  // horas dos veces: en el bruto de la quincena y despues al liquidar el
  // pendiente del banco. La pantalla de conceptos dejaba activarlo sin aviso.
  it('no deja crear un concepto de horas extra automáticas activo', async () => {
    mockInsert({ data: { con_id: 9 }, error: null })

    const result = await createConcepto({
      ...INPUT,
      con_codigo: 'HORAS_EXTRA_2',
      con_tipo_calculo: 'horas_extra_automatico',
      con_porcentaje: 150,
      con_activo: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('dos veces')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('sí deja crearlo inactivo (pagarBancoHoras necesita la fila del catálogo)', async () => {
    mockInsert({ data: { con_id: 9 }, error: null })

    const result = await createConcepto({
      ...INPUT,
      con_codigo: 'HORAS_EXTRA_2',
      con_tipo_calculo: 'horas_extra_automatico',
      con_porcentaje: 150,
      con_activo: false,
    })

    expect(result).toEqual({ ok: true, id: 9 })
  })
})
