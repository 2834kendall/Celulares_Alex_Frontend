import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { updateEmployeeDocument } from './updateEmployeeDocument'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { DocumentoMetadataInput } from '@/modules/employees/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

const VALID_INPUT: DocumentoMetadataInput = {
  doc_nombre: 'Contrato firmado',
  doc_tipo_id: 2,
  doc_descripcion: null,
  doc_fecha_vencimiento: null,
}

describe('updateEmployeeDocument (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un docId inválido SIN tocar permisos', async () => {
    const result = await updateEmployeeDocument(0, VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'Documento no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza input inválido SIN tocar permisos', async () => {
    const result = await updateEmployeeDocument(1, { ...VALID_INPUT, doc_nombre: 'x' })

    expect(result).toEqual({ ok: false, error: 'Datos del documento inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_WRITE', async () => {
    mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_empleado_id: 10 }, error: null },
        { data: null, error: null },
      ],
    })

    await updateEmployeeDocument(1, VALID_INPUT)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_WRITE)
  })

  it('rechaza un docId de otra empresa (RLS no devuelve fila)', async () => {
    mockClient({ sgrh_documentos: { data: null, error: null } })

    const result = await updateEmployeeDocument(999, VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'Documento no encontrado.' })
  })

  it('si el UPDATE falla, devuelve error', async () => {
    mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_empleado_id: 10 }, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await updateEmployeeDocument(1, VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el documento.' })
  })

  it('camino feliz: actualiza y revalida la ruta del empleado', async () => {
    const client = mockClient({
      sgrh_documentos: [
        { data: { doc_id: 1, doc_empleado_id: 10 }, error: null },
        { data: null, error: null },
      ],
    })

    const result = await updateEmployeeDocument(1, {
      doc_nombre: 'Contrato renovado',
      doc_tipo_id: 3,
      doc_descripcion: 'Firmado en enero',
      doc_fecha_vencimiento: '2030-01-01',
    })

    expect(result).toEqual({ ok: true })
    const updateBuilder = client.from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith({
      doc_nombre: 'Contrato renovado',
      doc_tipo_id: 3,
      doc_descripcion: 'Firmado en enero',
      doc_fecha_vencimiento: '2030-01-01',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })
})
