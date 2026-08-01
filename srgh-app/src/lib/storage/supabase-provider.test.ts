import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { createSupabaseStorageProvider } from './supabase-provider'
import { getStorageProvider } from './index'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

type StorageOptions = NonNullable<Parameters<typeof createSupabaseClientMock>[1]>['storage']

function mockStorage(storage?: StorageOptions) {
  const client = createSupabaseClientMock({}, { storage })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client.storage
}

const BODY = new Uint8Array([0xff, 0xd8, 0xff])

describe('createSupabaseStorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('upload', () => {
    it('sube al bucket mapeado del contenedor lógico con contentType y upsert', async () => {
      const storage = mockStorage({ uploadResult: { data: { path: '1/_lab/a.jpg' }, error: null } })

      const result = await createSupabaseStorageProvider().upload({
        container: 'FOTOS_EMPLEADO',
        path: '1/_lab/a.jpg',
        body: BODY,
        contentType: 'image/jpeg',
      })

      expect(result).toEqual({ ok: true, data: { path: '1/_lab/a.jpg' } })
      expect(storage.from).toHaveBeenCalledWith('fotos-empleados')
      expect(storage.bucketApi.upload).toHaveBeenCalledWith('1/_lab/a.jpg', BODY, {
        contentType: 'image/jpeg',
        upsert: false,
      })
    })

    it('propaga upsert: true', async () => {
      const storage = mockStorage()

      await createSupabaseStorageProvider().upload({
        container: 'FOTOS_EMPLEADO',
        path: '1/_lab/a.jpg',
        body: BODY,
        contentType: 'image/jpeg',
        upsert: true,
      })

      expect(storage.bucketApi.upload).toHaveBeenCalledWith(
        '1/_lab/a.jpg',
        BODY,
        expect.objectContaining({ upsert: true })
      )
    })

    it.each([
      [400, 'INVALID_TYPE'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [409, 'ALREADY_EXISTS'],
      [413, 'TOO_LARGE'],
      [500, 'UNKNOWN'],
    ])('mapea status %i a %s', async (status, code) => {
      mockStorage({
        uploadResult: { data: null, error: { message: 'boom', statusCode: String(status) } },
      })

      const result = await createSupabaseStorageProvider().upload({
        container: 'FOTOS_EMPLEADO',
        path: '1/_lab/a.jpg',
        body: BODY,
        contentType: 'image/jpeg',
      })

      expect(result).toEqual({ ok: false, error: code })
    })

    it('mapea el status numérico (campo status) igual que statusCode', async () => {
      mockStorage({ uploadResult: { data: null, error: { message: 'boom', status: 403 } } })

      const result = await createSupabaseStorageProvider().upload({
        container: 'FOTOS_EMPLEADO',
        path: '1/_lab/a.jpg',
        body: BODY,
        contentType: 'image/jpeg',
      })

      expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    })

    it('un error sin status es UNKNOWN', async () => {
      mockStorage({ uploadResult: { data: null, error: { message: 'boom' } } })

      const result = await createSupabaseStorageProvider().upload({
        container: 'FOTOS_EMPLEADO',
        path: '1/_lab/a.jpg',
        body: BODY,
        contentType: 'image/jpeg',
      })

      expect(result).toEqual({ ok: false, error: 'UNKNOWN' })
    })
  })

  describe('getSignedUrl', () => {
    it('firma una ruta y devuelve la URL como string opaco', async () => {
      const storage = mockStorage({
        signedUrlResult: { data: { signedUrl: 'https://cdn.example/x?token=t' }, error: null },
      })

      const result = await createSupabaseStorageProvider().getSignedUrl(
        'FOTOS_EMPLEADO',
        '1/_lab/a.jpg',
        300
      )

      expect(result).toEqual({ ok: true, data: 'https://cdn.example/x?token=t' })
      expect(storage.bucketApi.createSignedUrl).toHaveBeenCalledWith('1/_lab/a.jpg', 300, undefined)
    })

    it('downloadAs viaja como opción download del proveedor (fase 1B)', async () => {
      const storage = mockStorage()

      await createSupabaseStorageProvider().getSignedUrl('FOTOS_EMPLEADO', '1/_lab/a.jpg', 60, {
        downloadAs: 'contrato.pdf',
      })

      expect(storage.bucketApi.createSignedUrl).toHaveBeenCalledWith('1/_lab/a.jpg', 60, {
        download: 'contrato.pdf',
      })
    })

    it('mapea el error del proveedor', async () => {
      mockStorage({ signedUrlResult: { data: null, error: { message: 'nf', statusCode: '404' } } })

      const result = await createSupabaseStorageProvider().getSignedUrl(
        'FOTOS_EMPLEADO',
        '1/_lab/a.jpg',
        300
      )

      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
    })
  })

  describe('getSignedUrls', () => {
    it('firma N rutas en UNA sola llamada al proveedor', async () => {
      const storage = mockStorage({
        signedUrlsResult: {
          data: [
            { path: '1/_lab/a.jpg', signedUrl: 'https://cdn/a', error: null },
            { path: '1/_lab/b.png', signedUrl: 'https://cdn/b', error: null },
          ],
          error: null,
        },
      })

      const result = await createSupabaseStorageProvider().getSignedUrls(
        'FOTOS_EMPLEADO',
        ['1/_lab/a.jpg', '1/_lab/b.png'],
        300
      )

      expect(result).toEqual({
        ok: true,
        data: { '1/_lab/a.jpg': 'https://cdn/a', '1/_lab/b.png': 'https://cdn/b' },
      })
      expect(storage.bucketApi.createSignedUrls).toHaveBeenCalledTimes(1)
      expect(storage.bucketApi.createSignedUrls).toHaveBeenCalledWith(
        ['1/_lab/a.jpg', '1/_lab/b.png'],
        300
      )
    })

    it('omite las rutas que fallaron individualmente sin tumbar el lote', async () => {
      mockStorage({
        signedUrlsResult: {
          data: [
            { path: '1/_lab/a.jpg', signedUrl: 'https://cdn/a', error: null },
            { path: '1/_lab/borrada.png', signedUrl: null, error: 'Not found' },
          ],
          error: null,
        },
      })

      const result = await createSupabaseStorageProvider().getSignedUrls(
        'FOTOS_EMPLEADO',
        ['1/_lab/a.jpg', '1/_lab/borrada.png'],
        300
      )

      expect(result).toEqual({ ok: true, data: { '1/_lab/a.jpg': 'https://cdn/a' } })
    })

    it('con lista vacía no llama al proveedor', async () => {
      const storage = mockStorage()

      const result = await createSupabaseStorageProvider().getSignedUrls('FOTOS_EMPLEADO', [], 300)

      expect(result).toEqual({ ok: true, data: {} })
      expect(storage.bucketApi.createSignedUrls).not.toHaveBeenCalled()
    })

    it('mapea el error global del lote', async () => {
      mockStorage({ signedUrlsResult: { data: null, error: { message: 'x', statusCode: '403' } } })

      const result = await createSupabaseStorageProvider().getSignedUrls(
        'FOTOS_EMPLEADO',
        ['1/_lab/a.jpg'],
        300
      )

      expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    })
  })

  describe('list', () => {
    it('lista un prefijo y reconstruye rutas completas, filtrando carpetas virtuales', async () => {
      const storage = mockStorage({
        listResult: {
          data: [
            {
              id: 'obj-1',
              name: 'a.jpg',
              created_at: '2026-07-31T12:00:00Z',
              metadata: { size: 2048, mimetype: 'image/jpeg' },
            },
            { id: null, name: 'subcarpeta' }, // carpeta virtual: fuera
          ],
          error: null,
        },
      })

      const result = await createSupabaseStorageProvider().list('FOTOS_EMPLEADO', '1/_lab')

      expect(result).toEqual({
        ok: true,
        data: [
          {
            path: '1/_lab/a.jpg',
            sizeBytes: 2048,
            contentType: 'image/jpeg',
            createdAt: '2026-07-31T12:00:00Z',
          },
        ],
      })
      expect(storage.bucketApi.list).toHaveBeenCalledWith('1/_lab', {
        sortBy: { column: 'created_at', order: 'desc' },
      })
    })

    it('normaliza a null los metadatos que el proveedor no reporta', async () => {
      mockStorage({ listResult: { data: [{ id: 'obj-1', name: 'a.jpg' }], error: null } })

      const result = await createSupabaseStorageProvider().list('FOTOS_EMPLEADO', '1/_lab')

      expect(result).toEqual({
        ok: true,
        data: [{ path: '1/_lab/a.jpg', sizeBytes: null, contentType: null, createdAt: null }],
      })
    })

    it('mapea el error del proveedor', async () => {
      mockStorage({ listResult: { data: null, error: { message: 'x', statusCode: '403' } } })

      const result = await createSupabaseStorageProvider().list('FOTOS_EMPLEADO', '1/_lab')

      expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    })
  })

  describe('remove', () => {
    it('borra las rutas dadas', async () => {
      const storage = mockStorage()

      const result = await createSupabaseStorageProvider().remove('FOTOS_EMPLEADO', [
        '1/_lab/a.jpg',
      ])

      expect(result).toEqual({ ok: true, data: null })
      expect(storage.bucketApi.remove).toHaveBeenCalledWith(['1/_lab/a.jpg'])
    })

    it('con lista vacía no llama al proveedor', async () => {
      const storage = mockStorage()

      const result = await createSupabaseStorageProvider().remove('FOTOS_EMPLEADO', [])

      expect(result).toEqual({ ok: true, data: null })
      expect(storage.bucketApi.remove).not.toHaveBeenCalled()
    })

    it('mapea el error del proveedor', async () => {
      mockStorage({ removeResult: { data: null, error: { message: 'x', statusCode: '404' } } })

      const result = await createSupabaseStorageProvider().remove('FOTOS_EMPLEADO', [
        '1/_lab/a.jpg',
      ])

      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
    })
  })
})

describe('getStorageProvider (la costura)', () => {
  it('devuelve un provider que cumple el port completo', () => {
    const provider = getStorageProvider()

    expect(provider.upload).toBeTypeOf('function')
    expect(provider.getSignedUrl).toBeTypeOf('function')
    expect(provider.getSignedUrls).toBeTypeOf('function')
    expect(provider.list).toBeTypeOf('function')
    expect(provider.remove).toBeTypeOf('function')
  })
})
