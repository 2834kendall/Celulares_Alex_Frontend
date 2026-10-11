import { describe, expect, it } from 'vitest'
import { loadTardinessTypes } from './tardinessTypes'
import { DEFAULT_TARDINESS_TYPES } from './infractions'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'

function asClient(client: ReturnType<typeof createSupabaseClientMock>) {
  return client as unknown as Awaited<ReturnType<typeof createClient>>
}

describe('loadTardinessTypes', () => {
  it('mapea el catalogo de la empresa', async () => {
    const client = createSupabaseClientMock({
      sgrh_cat_tipos_tardia: {
        data: [
          {
            tta_id: 3,
            tta_nombre: 'Tarde',
            tta_desde_minutos: 2,
            tta_cuenta_advertencia: false,
            tta_color: '#112233',
          },
        ],
        error: null,
      },
    })

    const result = await loadTardinessTypes(asClient(client), 1)

    expect(result).toEqual({
      ok: true,
      data: [
        { id: 3, nombre: 'Tarde', desdeMinutos: 2, cuentaAdvertencia: false, color: '#112233' },
      ],
    })
    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith('tta_empresa_id', 1)
  })

  it('una empresa sin tipos cae a los de por defecto, para no dejar de registrar tardanzas', async () => {
    const client = createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: [], error: null } })

    expect(await loadTardinessTypes(asClient(client), 1)).toEqual({
      ok: true,
      data: DEFAULT_TARDINESS_TYPES,
    })
  })

  it('si la consulta falla devuelve el error, no los de por defecto', async () => {
    const client = createSupabaseClientMock({
      sgrh_cat_tipos_tardia: { data: null, error: { message: 'boom' } },
    })

    expect(await loadTardinessTypes(asClient(client), 1)).toEqual({
      ok: false,
      error: 'No se pudieron cargar los tipos de tardia.',
    })
  })
})
