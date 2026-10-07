import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmpresaLogoUrl } from './get-empresa-logo'
import { getEmpresaShell } from './get-empresa-shell'
import { getStorageProvider } from '@/lib/storage'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('./get-empresa-shell', () => ({ getEmpresaShell: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))

const getSignedUrl = vi.fn()

function shell(org_logo_url: string | null) {
  vi.mocked(getEmpresaShell).mockResolvedValue({
    org_nombre_fantasia: null,
    org_nombre_social: 'Empresa',
    org_formato_hora: '24h',
    org_logo_url,
  })
}

describe('getEmpresaLogoUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStorageProvider).mockReturnValue({ getSignedUrl } as unknown as StorageProvider)
  })

  it('sin logo devuelve null sin firmar nada', async () => {
    shell(null)

    expect(await getEmpresaLogoUrl()).toBeNull()
    expect(getSignedUrl).not.toHaveBeenCalled()
  })

  it('si no se pudo leer la empresa devuelve null', async () => {
    vi.mocked(getEmpresaShell).mockResolvedValue(null)

    expect(await getEmpresaLogoUrl()).toBeNull()
  })

  it('firma la ruta guardada en el bucket del logo', async () => {
    shell('1/logo/a.png')
    getSignedUrl.mockResolvedValue({ ok: true, data: 'https://firmada' })

    expect(await getEmpresaLogoUrl()).toBe('https://firmada')
    expect(getSignedUrl).toHaveBeenCalledWith('LOGO_EMPRESA', '1/logo/a.png', 3600)
  })

  it('si la firma falla, el menú cae a la inicial (null)', async () => {
    shell('1/logo/a.png')
    getSignedUrl.mockResolvedValue({ ok: false, error: 'PROVIDER_ERROR' })

    expect(await getEmpresaLogoUrl()).toBeNull()
  })
})
