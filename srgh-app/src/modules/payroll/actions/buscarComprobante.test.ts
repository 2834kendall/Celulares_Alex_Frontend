import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarComprobante } from './buscarComprobante'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type Cliente = Awaited<ReturnType<typeof createClient>>
type Respuesta = { data: unknown; error: unknown }

function cliente(tablas: Record<string, Respuesta>) {
  const mock = createSupabaseClientMock({
    sgrh_comprobantes_pago: { data: null, error: null },
    sgrh_pagos_extraordinarios: { data: null, error: null },
    ...tablas,
  })
  mockCreateClient.mockResolvedValue(mock as unknown as Cliente)
  return mock
}

/** Los .eq() que recibió la consulta a esa tabla. */
function filtros(mock: ReturnType<typeof createSupabaseClientMock>, tabla: string) {
  const i = mock.from.mock.calls.findIndex(([t]) => t === tabla)
  const builder = mock.from.mock.results[i].value as { eq: ReturnType<typeof vi.fn> }
  return builder.eq.mock.calls
}

describe('buscarComprobante', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('un código de planilla abre el comprobante de esa fila en su periodo', async () => {
    const mock = cliente({
      sgrh_comprobantes_pago: {
        data: { com_nomina_detalle_id: 41, sgrh_nomina_detalle: { ndt_nomina_periodo_id: 7 } },
        error: null,
      },
    })

    const r = await buscarComprobante('abcd efgh jkmn')

    expect(r).toEqual({ ok: true, href: '/comprobante/7/41' })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.NOMINA_READ)
    // Se busca como se guardó: mayúsculas y con guiones.
    expect(filtros(mock, 'sgrh_comprobantes_pago')).toEqual([
      ['com_codigo_verificacion', 'ABCD-EFGH-JKMN'],
    ])
    expect(mock.from.mock.calls.map((c) => c[0])).not.toContain('sgrh_pagos_extraordinarios')
  })

  it('un código de aguinaldo o liquidación abre el comprobante extraordinario', async () => {
    const mock = cliente({
      sgrh_pagos_extraordinarios: { data: { pex_id: 9 }, error: null },
    })

    const r = await buscarComprobante('WXYZ-2345-6789')

    expect(r).toEqual({ ok: true, href: '/comprobante/extraordinario/9' })
    expect(filtros(mock, 'sgrh_pagos_extraordinarios')).toEqual([
      ['pex_codigo_verificacion', 'WXYZ-2345-6789'],
    ])
  })

  it('un código que no existe lo dice, con el código buscado', async () => {
    cliente({})

    const r = await buscarComprobante('ABCD-EFGH-JKMN')

    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('No hay ningún comprobante con el código ABCD-EFGH-JKMN')
  })

  it('si RLS esconde la fila de planilla, no arma una ruta rota', async () => {
    cliente({
      sgrh_comprobantes_pago: {
        data: { com_nomina_detalle_id: 41, sgrh_nomina_detalle: null },
        error: null,
      },
    })

    const r = await buscarComprobante('ABCD-EFGH-JKMN')

    expect(r.ok).toBe(false)
  })

  it('un código mal escrito no consulta la base', async () => {
    const mock = cliente({})

    const r = await buscarComprobante('ABCD-EFG')

    expect(r).toEqual({
      ok: false,
      error: 'El código tiene 12 letras o números, con el formato XXXX-XXXX-XXXX.',
    })
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('vacío pide el código', async () => {
    cliente({})

    expect(await buscarComprobante('   ')).toEqual({
      ok: false,
      error: 'Escribí el código de verificación del comprobante.',
    })
  })

  it('si falla la consulta, error genérico', async () => {
    cliente({ sgrh_comprobantes_pago: { data: null, error: { message: 'boom' } } })

    expect(await buscarComprobante('ABCD-EFGH-JKMN')).toEqual({
      ok: false,
      error: 'No se pudo buscar el comprobante.',
    })
  })

  it('si falla la consulta de pagos extraordinarios, error genérico', async () => {
    cliente({ sgrh_pagos_extraordinarios: { data: null, error: { message: 'boom' } } })

    expect(await buscarComprobante('ABCD-EFGH-JKMN')).toEqual({
      ok: false,
      error: 'No se pudo buscar el comprobante.',
    })
  })
})
