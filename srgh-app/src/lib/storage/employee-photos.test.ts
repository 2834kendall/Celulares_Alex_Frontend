import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signEmployeePhotos } from './employee-photos'
import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'

vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))

const getSignedUrls = vi.fn()

describe('signEmployeePhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStorageProvider).mockReturnValue({ getSignedUrls } as unknown as ReturnType<
      typeof getStorageProvider
    >)
  })

  it('sin paths no llama al proveedor', async () => {
    expect(await signEmployeePhotos([null, undefined, ''])).toEqual({})
    expect(getSignedUrls).not.toHaveBeenCalled()
  })

  it('firma en una sola llamada y sin repetir paths', async () => {
    const mapa = { 'e/1.jpg': 'https://cdn/1', 'e/2.jpg': 'https://cdn/2' }
    getSignedUrls.mockResolvedValue({ ok: true, data: mapa })

    const result = await signEmployeePhotos(['e/1.jpg', null, 'e/2.jpg', 'e/1.jpg'])

    expect(result).toEqual(mapa)
    expect(getSignedUrls).toHaveBeenCalledTimes(1)
    expect(getSignedUrls).toHaveBeenCalledWith('FOTOS_EMPLEADO', ['e/1.jpg', 'e/2.jpg'], TTL_FOTO)
  })

  it('si el firmado falla devuelve un mapa vacío (la pantalla cae a iniciales)', async () => {
    getSignedUrls.mockResolvedValue({ ok: false, error: 'PROVIDER_ERROR' })

    expect(await signEmployeePhotos(['e/1.jpg'])).toEqual({})
  })
})
