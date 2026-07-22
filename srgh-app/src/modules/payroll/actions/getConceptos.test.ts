import { describe, expect, it, vi } from 'vitest'
import { getConceptos } from './getConceptos'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

const CONCEPTO = {
  con_id: 1,
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

describe('getConceptos (server action)', () => {
  it('devuelve error genérico si falla la consulta', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_conceptos_nomina: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getConceptos()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron cargar los conceptos de nómina.',
    })
  })

  it('devuelve el catálogo tal cual viene de la base', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_conceptos_nomina: { data: [CONCEPTO], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getConceptos()

    expect(result).toEqual({ ok: true, data: [CONCEPTO] })
  })
})
