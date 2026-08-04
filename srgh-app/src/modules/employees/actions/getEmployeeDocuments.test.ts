import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmployeeDocuments } from './getEmployeeDocuments'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getEmployeeDocuments (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un empId inválido SIN tocar permisos', async () => {
    const result = await getEmployeeDocuments(0)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_READ', async () => {
    mockClient({ sgrh_documentos: { data: [], error: null } })

    await getEmployeeDocuments(10)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_READ)
  })

  it('devuelve error genérico si supabase falla', async () => {
    mockClient({ sgrh_documentos: { data: null, error: { message: 'boom' } } })

    const result = await getEmployeeDocuments(10)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los documentos.' })
  })

  it('camino feliz: mapea el join a tipo_nombre', async () => {
    mockClient({
      sgrh_documentos: {
        data: [
          {
            doc_id: 1,
            doc_empleado_id: 10,
            doc_tipo_id: 2,
            doc_nombre: 'Contrato firmado',
            doc_descripcion: null,
            doc_fecha_vencimiento: null,
            doc_mime: 'application/pdf',
            doc_created_at: '2026-01-01T00:00:00Z',
            sgrh_cat_tipos_documento: { tdo_nombre: 'Contrato' },
          },
        ],
        error: null,
      },
    })

    const result = await getEmployeeDocuments(10)

    expect(result).toEqual({
      ok: true,
      data: [
        {
          doc_id: 1,
          doc_empleado_id: 10,
          doc_tipo_id: 2,
          doc_nombre: 'Contrato firmado',
          doc_descripcion: null,
          doc_fecha_vencimiento: null,
          doc_mime: 'application/pdf',
          doc_created_at: '2026-01-01T00:00:00Z',
          tipo_nombre: 'Contrato',
        },
      ],
    })
  })

  it('lista vacía es un resultado válido', async () => {
    mockClient({ sgrh_documentos: { data: [], error: null } })

    const result = await getEmployeeDocuments(10)

    expect(result).toEqual({ ok: true, data: [] })
  })
})
