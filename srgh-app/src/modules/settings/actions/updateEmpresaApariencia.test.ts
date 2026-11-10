import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateEmpresaApariencia } from './updateEmpresaApariencia'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

function empresa(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_empresas: result })
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return client
}

function claims(empresa_id: unknown) {
  vi.mocked(requirePermission).mockResolvedValue({
    app_metadata: { empresa_id },
  } as unknown as Awaited<ReturnType<typeof requirePermission>>)
}

beforeEach(() => {
  vi.clearAllMocks()
  claims(1)
})

describe('updateEmpresaApariencia', () => {
  it('rechaza un hex inválido sin pedir permiso', async () => {
    const r = await updateEmpresaApariencia({ colorAcento: '#12', colorSidebar: null })
    expect(r).toEqual({
      ok: false,
      error: 'El color de acento debe ser un hex válido (ej. #0891B2).',
    })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPRESAS_WRITE', async () => {
    empresa({ data: [{ org_id: 1 }], error: null })
    await updateEmpresaApariencia({ colorAcento: null, colorSidebar: null })
    expect(requirePermission).toHaveBeenCalledWith('EMPRESAS_WRITE')
  })

  it('sin empresa en el JWT no escribe', async () => {
    claims(undefined)
    const r = await updateEmpresaApariencia({ colorAcento: null, colorSidebar: null })
    expect(r.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('escribe en la fila de la empresa del JWT', async () => {
    const client = empresa({ data: [{ org_id: 1 }], error: null })
    const r = await updateEmpresaApariencia({ colorAcento: '#0891b2', colorSidebar: '#eef1f4' })
    expect(r).toEqual({ ok: true })
    const query = client.from.mock.results[0].value as {
      update: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
    }
    expect(query.update).toHaveBeenCalledWith({
      org_color_acento: '#0891b2',
      org_color_sidebar: '#eef1f4',
    })
    expect(query.eq).toHaveBeenCalledWith('org_id', 1)
  })

  // Una escritura que la RLS filtra no da error: afecta 0 filas.
  it('trata 0 filas afectadas como fallo', async () => {
    empresa({ data: [], error: null })
    const r = await updateEmpresaApariencia({ colorAcento: null, colorSidebar: null })
    expect(r).toEqual({ ok: false, error: 'No se pudo guardar la apariencia.' })
  })

  it('mapea el error de la base a un mensaje genérico', async () => {
    empresa({ data: null, error: { code: '23514', message: 'check' } })
    const r = await updateEmpresaApariencia({ colorAcento: null, colorSidebar: null })
    expect(r).toEqual({ ok: false, error: 'No se pudo guardar la apariencia.' })
  })
})
