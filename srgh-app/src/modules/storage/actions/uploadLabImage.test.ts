import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { uploadLabImage } from './uploadLabImage'
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
    upload: vi.fn(async () => ({ ok: true as const, data: { path: '1/_lab/x.jpg' } })),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

function formDataWithJpeg(size = 64): FormData {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  const formData = new FormData()
  formData.set('file', new File([bytes], 'foto.jpg', { type: 'image/jpeg' }))
  return formData
}

describe('uploadLabImage (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza el FormData sin archivo SIN tocar permisos ni proveedor', async () => {
    const result = await uploadLabImage(new FormData())

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockGetStorageProvider).not.toHaveBeenCalled()
  })

  it('rechaza un archivo vacío sin tocar permisos', async () => {
    const formData = new FormData()
    formData.set('file', new File([], 'vacio.jpg'))

    const result = await uploadLabImage(formData)

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige EMPLEADOS_WRITE', async () => {
    mockProvider()

    await uploadLabImage(formDataWithJpeg())

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const provider = mockProvider()

    const result = await uploadLabImage(formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('rechaza por magic bytes un archivo que no es imagen (file.type miente)', async () => {
    const provider = mockProvider()
    const formData = new FormData()
    const texto = new TextEncoder().encode('no soy un jpg')
    formData.set('file', new File([texto], 'falso.jpg', { type: 'image/jpeg' }))

    const result = await uploadLabImage(formData)

    expect(result).toEqual({ ok: false, error: 'El tipo de archivo no está permitido.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('sube con ruta de la empresa del JWT y contentType del sniff', async () => {
    const provider = mockProvider()

    const result = await uploadLabImage(formDataWithJpeg())

    expect(result).toEqual({ ok: true, path: '1/_lab/x.jpg' })
    expect(provider.upload).toHaveBeenCalledWith({
      container: 'FOTOS_EMPLEADO',
      path: expect.stringMatching(/^1\/_lab\/[0-9a-f-]{36}\.jpg$/),
      body: expect.any(Uint8Array),
      contentType: 'image/jpeg',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/storage-lab')
  })

  it('traduce el error del proveedor y no revalida', async () => {
    mockProvider({
      upload: vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' as const })),
    })

    const result = await uploadLabImage(formDataWithJpeg())

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para acceder a este archivo.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
