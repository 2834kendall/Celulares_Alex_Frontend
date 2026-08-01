import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { uploadLabDocument } from './uploadLabDocument'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(async () => ({ ok: true as const, data: { path: '1/_lab/x.pdf' } })),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

function formDataWithPdf(name = 'contrato.pdf'): FormData {
  const bytes = new Uint8Array(64)
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // %PDF-1.7
  const formData = new FormData()
  formData.set('file', new File([bytes], name, { type: 'application/pdf' }))
  return formData
}

describe('uploadLabDocument (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza el FormData sin archivo SIN tocar permisos ni proveedor', async () => {
    const result = await uploadLabDocument(new FormData())

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockGetStorageProvider).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_WRITE (no EMPLEADOS_WRITE)', async () => {
    mockProvider()

    await uploadLabDocument(formDataWithPdf())

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await uploadLabDocument(formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('rechaza por magic bytes un HTML renombrado a .pdf', async () => {
    const provider = mockProvider()
    const formData = new FormData()
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')
    formData.set('file', new File([html], 'malicioso.pdf', { type: 'application/pdf' }))

    const result = await uploadLabDocument(formData)

    expect(result).toEqual({ ok: false, error: 'El tipo de archivo no está permitido.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('sube con ruta de la empresa del JWT, contentType del sniff y devuelve el nombre sanitizado', async () => {
    const provider = mockProvider()

    const result = await uploadLabDocument(formDataWithPdf('../../etc/passwd.pdf'))

    expect(result).toEqual({ ok: true, path: '1/_lab/x.pdf', fileName: 'etc passwd.pdf' })
    expect(provider.upload).toHaveBeenCalledWith({
      container: 'DOCUMENTOS_EMPLEADO',
      path: expect.stringMatching(/^1\/_lab\/[0-9a-f-]{36}\.pdf$/),
      body: expect.any(Uint8Array),
      contentType: 'application/pdf',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/storage-lab')
  })

  it('traduce el error del proveedor y no revalida', async () => {
    mockProvider({
      upload: vi.fn(async () => ({ ok: false as const, error: 'TOO_LARGE' as const })),
    })

    const result = await uploadLabDocument(formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'El archivo supera el tamaño máximo permitido.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
