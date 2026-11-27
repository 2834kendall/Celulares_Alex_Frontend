import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { fetchSalariosContratos } from './fetchSalariosContratos'

describe('fetchSalariosContratos', () => {
  it('devuelve un Map vacío sin llamar al RPC cuando la lista está vacía o no tiene IDs válidos', async () => {
    const mock = createSupabaseClientMock({})
    const supabase = mock as unknown as SupabaseClient<Database>

    const resEmpty = await fetchSalariosContratos(supabase, [])
    expect(resEmpty).toEqual({ ok: true, data: new Map() })
    expect(mock.rpc).not.toHaveBeenCalled()

    const resInvalid = await fetchSalariosContratos(supabase, [0, -3, 1.5, Number.NaN])
    expect(resInvalid).toEqual({ ok: true, data: new Map() })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('deduplica IDs positivos enteros, llama a obtener_salarios_historial y mapea resultados', async () => {
    const mock = createSupabaseClientMock(
      {},
      {
        rpcResponses: {
          obtener_salarios_historial: {
            data: [
              { lab_id: 10, lab_salario_base: 500000, lab_salario_real: 550000 },
              { lab_id: 20, lab_salario_base: 600000, lab_salario_real: 600000 },
            ],
            error: null,
          },
        },
      }
    )
    const supabase = mock as unknown as SupabaseClient<Database>

    const result = await fetchSalariosContratos(supabase, [10, 20, 10, -1, 0, 20])

    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc).toHaveBeenCalledWith('obtener_salarios_historial', {
      p_lab_ids: [10, 20],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.get(10)).toEqual({
        lab_salario_base: 500000,
        lab_salario_real: 550000,
      })
      expect(result.data.get(20)).toEqual({
        lab_salario_base: 600000,
        lab_salario_real: 600000,
      })
      expect(result.data.size).toBe(2)
    }
  })

  it('devuelve ok: false cuando el RPC falla', async () => {
    const mock = createSupabaseClientMock(
      {},
      {
        rpcResponses: {
          obtener_salarios_historial: {
            data: null,
            error: { message: 'permission denied for function obtener_salarios_historial' },
          },
        },
      }
    )
    const supabase = mock as unknown as SupabaseClient<Database>

    const result = await fetchSalariosContratos(supabase, [15])

    expect(result).toEqual({
      ok: false,
      error: 'permission denied for function obtener_salarios_historial',
    })
  })
})
