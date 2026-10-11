import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getCompanyProfile } from './getCompanyProfile'
import { updateCompanyProfile } from './updateCompanyProfile'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { StorageProvider } from '@/lib/storage/types'
import type { CompanyProfileInput } from '@/modules/settings/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)
const mockRevalidatePath = vi.mocked(revalidatePath)

function mockClient(...args: Parameters<typeof createSupabaseClientMock>) {
  const client = createSupabaseClientMock(...args)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function mockSign(result: { ok: true; data: string } | { ok: false; error: 'PROVIDER_ERROR' }) {
  const provider = { getSignedUrl: vi.fn(async () => result) }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

const ROW = {
  org_cedula_juridica: '3-101-123456',
  org_nombre_social: 'Celulares Alex S.A.',
  org_nombre_fantasia: 'Celulares Alex',
  org_email_corporativo: null,
  org_telefono: '2222-3333',
  org_representante_legal: null,
  org_actividad_economica_ciiu: '4741',
  org_logo_url: '1/logo/a.png',
  sgrh_direcciones: { dir_distrito_id: 101, dir_senas_exactas: null },
}

const VALID: CompanyProfileInput = {
  org_nombre_social: 'Celulares Alex S.A.',
  org_nombre_fantasia: '',
  org_email_corporativo: 'info@celularesalex.cr',
  org_telefono: '',
  org_representante_legal: 'Alex',
  org_actividad_economica_ciiu: '',
  direccion: { dir_distrito_id: 101, dir_senas_exactas: '200 m norte del parque central' },
}

describe('getCompanyProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exige EMPRESAS_WRITE', async () => {
    mockClient({ sgrh_empresas: { data: ROW, error: null } })
    mockSign({ ok: true, data: 'https://firmada' })

    await getCompanyProfile()

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPRESAS_WRITE)
  })

  it('arma el perfil con la dirección y el logo firmado (sin exponer la ruta)', async () => {
    mockClient({ sgrh_empresas: { data: ROW, error: null } })
    const provider = mockSign({ ok: true, data: 'https://firmada' })

    const result = await getCompanyProfile()

    expect(provider.getSignedUrl).toHaveBeenCalledWith('LOGO_EMPRESA', '1/logo/a.png', 3600)
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        org_cedula_juridica: '3-101-123456',
        direccion: { dir_distrito_id: 101, dir_senas_exactas: '' },
        logoUrl: 'https://firmada',
      }),
    })
    expect(result.ok && 'org_logo_url' in result.data).toBe(false)
  })

  it('sin logo ni dirección devuelve null en ambos sin firmar nada', async () => {
    mockClient({
      sgrh_empresas: { data: { ...ROW, org_logo_url: null, sgrh_direcciones: null }, error: null },
    })
    const provider = mockSign({ ok: true, data: 'x' })

    const result = await getCompanyProfile()

    expect(provider.getSignedUrl).not.toHaveBeenCalled()
    expect(result.ok && result.data.direccion).toBeNull()
    expect(result.ok && result.data.logoUrl).toBeNull()
  })

  it('si la firma falla, la página igual se muestra sin logo', async () => {
    mockClient({ sgrh_empresas: { data: ROW, error: null } })
    mockSign({ ok: false, error: 'PROVIDER_ERROR' })

    const result = await getCompanyProfile()

    expect(result.ok && result.data.logoUrl).toBeNull()
  })

  it('error de la consulta', async () => {
    mockClient({ sgrh_empresas: { data: null, error: { message: 'x' } } })

    expect(await getCompanyProfile()).toEqual({
      ok: false,
      error: 'No se pudieron cargar los datos de la empresa.',
    })
  })
})

describe('updateCompanyProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('input inválido: no toca permisos ni la base', async () => {
    const result = await updateCompanyProfile({ ...VALID, org_nombre_social: '' })

    expect(result).toEqual({ ok: false, error: 'Datos inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza un correo o teléfono mal escrito', async () => {
    expect((await updateCompanyProfile({ ...VALID, org_email_corporativo: 'no' })).ok).toBe(false)
    expect((await updateCompanyProfile({ ...VALID, org_telefono: 'abc' })).ok).toBe(false)
  })

  it('llama a la RPC con los campos vacíos como null y separa la dirección', async () => {
    const client = mockClient(
      {},
      { rpcResponses: { actualizar_perfil_empresa: { data: null, error: null } } }
    )

    const result = await updateCompanyProfile(VALID)

    expect(result).toEqual({ ok: true })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPRESAS_WRITE)
    expect(client.rpc).toHaveBeenCalledWith('actualizar_perfil_empresa', {
      p_datos: {
        org_nombre_social: 'Celulares Alex S.A.',
        org_nombre_fantasia: null,
        org_email_corporativo: 'info@celularesalex.cr',
        org_telefono: null,
        org_representante_legal: 'Alex',
        org_actividad_economica_ciiu: null,
      },
      p_direccion: { dir_distrito_id: 101, dir_senas_exactas: '200 m norte del parque central' },
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it.each(['42501', '23514', '23503'])('el error %s muestra el mensaje de la RPC', async (code) => {
    mockClient(
      {},
      {
        rpcResponses: {
          actualizar_perfil_empresa: { data: null, error: { code, message: 'Mensaje RPC' } },
        },
      }
    )

    expect(await updateCompanyProfile(VALID)).toEqual({ ok: false, error: 'Mensaje RPC' })
  })

  it('cualquier otro error es genérico y no revalida', async () => {
    mockClient(
      {},
      {
        rpcResponses: {
          actualizar_perfil_empresa: { data: null, error: { code: 'XX000', message: 'interno' } },
        },
      }
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await updateCompanyProfile(VALID)).toEqual({
      ok: false,
      error: 'No se pudieron guardar los datos de la empresa.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
