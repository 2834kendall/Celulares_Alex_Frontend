import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { addEmployeeDocument } from './addEmployeeDocument'
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
      data: { path: '1/empleados/10/x.pdf' },
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
  formData.set('file', new File([bytes], 'contrato.pdf', { type: 'application/pdf' }))
  formData.set('doc_nombre', overrides.doc_nombre ?? 'Contrato firmado')
  formData.set('doc_tipo_id', overrides.doc_tipo_id ?? '2')
  if (overrides.doc_descripcion !== undefined) {
    formData.set('doc_descripcion', overrides.doc_descripcion)
  }
  if (overrides.doc_fecha_vencimiento !== undefined) {
    formData.set('doc_fecha_vencimiento', overrides.doc_fecha_vencimiento)
  }
  return formData
}

describe('addEmployeeDocument (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza el FormData sin archivo SIN tocar permisos', async () => {
    const result = await addEmployeeDocument(10, new FormData())

    expect(result).toEqual({ ok: false, error: 'Selecciona un archivo.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un empId inválido SIN tocar permisos', async () => {
    const result = await addEmployeeDocument(0, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza metadata inválida (nombre corto) SIN tocar permisos', async () => {
    const result = await addEmployeeDocument(10, formDataWithPdf({ doc_nombre: 'x' }))

    expect(result).toEqual({ ok: false, error: 'Datos del documento inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza metadata inválida (tipo 0) SIN tocar permisos', async () => {
    const result = await addEmployeeDocument(10, formDataWithPdf({ doc_tipo_id: '0' }))

    expect(result).toEqual({ ok: false, error: 'Datos del documento inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza metadata inválida (fecha malformada) SIN tocar permisos', async () => {
    const result = await addEmployeeDocument(
      10,
      formDataWithPdf({ doc_fecha_vencimiento: '31-12-2026' })
    )

    expect(result).toEqual({ ok: false, error: 'Datos del documento inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige DOCUMENTOS_WRITE', async () => {
    mockClient({
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_documentos: { data: { doc_id: 1 }, error: null },
    })
    mockProvider()

    await addEmployeeDocument(10, formDataWithPdf())

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_WRITE)
  })

  it('falla si el JWT no trae empresa_id, sin crear el cliente', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await addEmployeeDocument(10, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza un empId de otra empresa (RLS no devuelve fila) sin tocar el proveedor', async () => {
    mockClient({ sgrh_empleados: { data: null, error: null } })
    const provider = mockProvider()

    const result = await addEmployeeDocument(999, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('rechaza por magic bytes sin tocar el proveedor', async () => {
    mockClient({ sgrh_empleados: { data: { emp_id: 10 }, error: null } })
    const provider = mockProvider()

    const formData = formDataWithPdf()
    const texto = new TextEncoder().encode('no es un pdf')
    formData.set('file', new File([texto], 'falso.pdf', { type: 'application/pdf' }))

    const result = await addEmployeeDocument(10, formData)

    expect(result).toEqual({ ok: false, error: 'El tipo de archivo no está permitido.' })
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('si el upload falla, no toca la DB', async () => {
    mockClient({ sgrh_empleados: { data: { emp_id: 10 }, error: null } })
    const provider = mockProvider({
      upload: vi.fn(async () => ({ ok: false as const, error: 'TOO_LARGE' as const })),
    })

    const result = await addEmployeeDocument(10, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'El archivo supera el tamaño máximo permitido.' })
    expect(provider.remove).not.toHaveBeenCalled()
  })

  it('si el INSERT falla, revierte el objeto recién subido (rollback)', async () => {
    mockClient({
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_documentos: { data: null, error: { message: 'boom' } },
    })
    const provider = mockProvider()

    const result = await addEmployeeDocument(10, formDataWithPdf())

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el documento.' })
    expect(provider.remove).toHaveBeenCalledWith('DOCUMENTOS_EMPLEADO', ['1/empleados/10/x.pdf'])
  })

  it('camino feliz: sube, inserta la fila y revalida la ruta', async () => {
    const client = mockClient({
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_documentos: { data: { doc_id: 42 }, error: null },
    })
    const provider = mockProvider()

    const result = await addEmployeeDocument(
      10,
      formDataWithPdf({ doc_descripcion: 'Firmado en enero', doc_fecha_vencimiento: '2030-01-01' })
    )

    expect(result).toEqual({ ok: true, docId: 42 })
    expect(provider.upload).toHaveBeenCalledWith({
      container: 'DOCUMENTOS_EMPLEADO',
      path: expect.stringMatching(/^1\/empleados\/10\/[0-9a-f-]{36}\.pdf$/),
      body: expect.any(Uint8Array),
      contentType: 'application/pdf',
    })
    const insertBuilder = client.from.mock.results[1].value
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      doc_empresa_id: 1,
      doc_empleado_id: 10,
      doc_tipo_id: 2,
      doc_nombre: 'Contrato firmado',
      doc_descripcion: 'Firmado en enero',
      doc_fecha_vencimiento: '2030-01-01',
      doc_path: '1/empleados/10/x.pdf',
      doc_mime: 'application/pdf',
      doc_creado_por: 5,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })
})
