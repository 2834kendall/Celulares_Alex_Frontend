import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmpresaNombre } from './get-empresa-nombre'
import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/lib/brand'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockEmpresa(result: { data: unknown; error: unknown }) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({ sgrh_empresas: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

describe('getEmpresaNombre', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefiere el nombre de fantasía cuando existe', async () => {
    mockEmpresa({
      data: { org_nombre_fantasia: 'TecnoCel', org_nombre_social: 'TecnoCel S.A.' },
      error: null,
    })

    expect(await getEmpresaNombre()).toBe('TecnoCel')
  })

  it('usa el nombre social si no hay nombre de fantasía', async () => {
    mockEmpresa({
      data: { org_nombre_fantasia: null, org_nombre_social: 'TecnoCel S.A.' },
      error: null,
    })

    expect(await getEmpresaNombre()).toBe('TecnoCel S.A.')
  })

  it('ignora nombre de fantasía en blanco', async () => {
    mockEmpresa({
      data: { org_nombre_fantasia: '   ', org_nombre_social: 'TecnoCel S.A.' },
      error: null,
    })

    expect(await getEmpresaNombre()).toBe('TecnoCel S.A.')
  })

  it('cae al nombre de marca si la consulta falla', async () => {
    mockEmpresa({ data: null, error: { message: 'boom' } })

    expect(await getEmpresaNombre()).toBe(BRAND.empresa)
  })

  it('cae al nombre de marca si RLS no devuelve fila', async () => {
    mockEmpresa({ data: null, error: null })

    expect(await getEmpresaNombre()).toBe(BRAND.empresa)
  })
})
