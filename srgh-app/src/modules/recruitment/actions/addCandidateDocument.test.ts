import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { addCandidateDocument } from './addCandidateDocument'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1, usr_id: 5 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(async () => ({
      ok: true as const,
      data: { path: '1/candidatos/9/x.pdf' },
    })),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

function formDataWithPdf(overrides: Record<string, string> = {}): FormData {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0])
  const formData = new FormData()
  formData.set('file', new File([bytes], 'cv.pdf', { type: 'application/pdf' }))
  formData.set('cdo_tipo', overrides.cdo_tipo ?? 'CV')
  formData.set('cdo_nombre', overrides.cdo_nombre ?? 'CV actualizado')
  return formData
}

describe('addCandidateDocument (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza el FormData sin archivo SIN tocar permisos', async () => {
    const result = await addCandidateDocument(9, new FormData())

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un candidatoId inválido SIN tocar permisos', async () => {
    const result = await addCandidateDocument(0, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'Candidato no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza metadata inválida (tipo fuera del enum) SIN tocar permisos', async () => {
    const result = await addCandidateDocument(9, formDataWithPdf({ cdo_tipo: 'PASAPORTE' }))

    expect(result).toEqual({ ok: false, error: 'Datos del documento inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient({
      sgrh_candidatos: { data: { cdt_id: 9 }, error: null },
      sgrh_candidato_documentos: { data: { cdo_id: 1 }, error: null },
    })
    mockProvider()

    await addCandidateDocument(9, formDataWithPdf())

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('rechaza un candidatoId de otra empresa (RLS no devuelve fila) sin tocar el proveedor', async () => {
    mockClient({ sgrh_candidatos: { data: null, error: null } })
    const provider = mockProvider()

    const result = await addCandidateDocument(999, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'Candidato no encontrado.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('si el INSERT falla, revierte el objeto recién subido (rollback)', async () => {
    mockClient({
      sgrh_candidatos: { data: { cdt_id: 9 }, error: null },
      sgrh_candidato_documentos: { data: null, error: { message: 'boom' } },
    })
    const provider = mockProvider()

    const result = await addCandidateDocument(9, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el documento.' })
    expect(provider.remove).toHaveBeenCalledWith('CV_CANDIDATO', ['1/candidatos/9/x.pdf'])
  })

  it('camino feliz: sube, inserta la fila y revalida la ficha del candidato', async () => {
    const client = mockClient({
      sgrh_candidatos: { data: { cdt_id: 9 }, error: null },
      sgrh_candidato_documentos: { data: { cdo_id: 42 }, error: null },
    })
    const provider = mockProvider()

    const result = await addCandidateDocument(9, formDataWithPdf())

    expect(result).toEqual({ ok: true, docId: 42 })
    expect(provider.upload).toHaveBeenCalledWith({
      container: 'CV_CANDIDATO',
      path: expect.stringMatching(/^1\/candidatos\/9\/[0-9a-f-]{36}\.pdf$/),
      body: expect.any(Uint8Array),
      contentType: 'application/pdf',
    })
    const insertBuilder = client.from.mock.results[1].value
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      cdo_empresa_id: 1,
      cdo_candidato_id: 9,
      cdo_tipo: 'CV',
      cdo_nombre: 'CV actualizado',
      cdo_path: '1/candidatos/9/x.pdf',
      cdo_mime: 'application/pdf',
      cdo_creado_por: 5,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment/candidates/9')
  })
})
