import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { setMarcaPreview } from './setMarcaPreview'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { MARCA_PREVIEW_COOKIE } from '@/lib/empresa/marca-preview'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const store = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }

function marca(result: { data: unknown; error: unknown }) {
  vi.mocked(createClient).mockResolvedValue(
    createSupabaseClientMock({ sgrh_marcas_comerciales: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>)
  vi.mocked(requirePermission).mockResolvedValue(
    {} as unknown as Awaited<ReturnType<typeof requirePermission>>
  )
})

describe('setMarcaPreview', () => {
  it('rechaza un id inválido sin pedir permiso', async () => {
    expect(await setMarcaPreview(0)).toEqual({ ok: false, error: 'Marca inválida.' })
    expect(await setMarcaPreview(1.5)).toEqual({ ok: false, error: 'Marca inválida.' })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPRESAS_WRITE', async () => {
    marca({ data: { mco_id: 3 }, error: null })
    await setMarcaPreview(3)
    expect(requirePermission).toHaveBeenCalledWith('EMPRESAS_WRITE')
  })

  it('con null vuelve a "Mi vista" sin consultar nada', async () => {
    expect(await setMarcaPreview(null)).toEqual({ ok: true })
    expect(store.delete).toHaveBeenCalledWith(MARCA_PREVIEW_COOKIE)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('no guarda una marca que la RLS no deja ver (otra empresa o inexistente)', async () => {
    marca({ data: null, error: null })
    const r = await setMarcaPreview(99)
    expect(r.ok).toBe(false)
    expect(store.set).not.toHaveBeenCalled()
  })

  it('guarda la marca validada en una cookie httpOnly', async () => {
    marca({ data: { mco_id: 3 }, error: null })
    expect(await setMarcaPreview(3)).toEqual({ ok: true })
    expect(store.set).toHaveBeenCalledWith(
      MARCA_PREVIEW_COOKIE,
      '3',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' })
    )
  })
})
