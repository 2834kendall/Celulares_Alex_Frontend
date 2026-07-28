import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAusenciaTypes } from './getAusenciaTypes'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { AusenciaTypeRow } from '@/modules/absences/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

describe('getAusenciaTypes (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no exige un permiso especifico: es un catalogo global', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_ausencia: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciaTypes()

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('devuelve error generico si supabase falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_ausencia: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciaTypes()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los tipos de ausencia.' })
  })

  it('devuelve el catalogo legal en exito', async () => {
    const data: AusenciaTypeRow[] = [
      {
        tau_id: 1,
        tau_codigo: 'PERM_LACTANCIA',
        tau_nombre: 'Periodo de lactancia',
        tau_requiere_documento_ccss: false,
        tau_paga_empleador_dias: 0,
        tau_porcentaje_pago_empleador: 100,
        tau_paga_ccss_desde_dia: null,
        tau_porcentaje_subsidio_ccss: null,
        tau_descuenta_vacaciones: false,
        tau_es_protegida: true,
        tau_referencia_legal: 'Codigo de Trabajo, art. 97',
        tau_es_intradia: true,
      },
    ]
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_ausencia: { data, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciaTypes()

    expect(result).toEqual({ ok: true, data })
  })
})
