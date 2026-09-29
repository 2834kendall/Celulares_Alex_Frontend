import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getContratosPorLiquidar } from './getContratosPorLiquidar'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const RENUNCIA = {
  mot_nombre: 'Renuncia Voluntaria',
  mot_genera_cesantia: false,
  mot_genera_preaviso: false,
  mot_nota_legal: 'Sin responsabilidad patronal.',
}

function terminado(labId: number, nombre: string, liquidaciones: unknown) {
  return {
    lab_id: labId,
    lab_fecha_fin: '2026-09-20',
    sgrh_empleados: {
      emp_numero_identificacion: `${labId}-0000-0000`,
      emp_nombre: nombre,
      emp_apellido_1: 'Mora',
      emp_apellido_2: null,
    },
    sgrh_cat_motivos_salida: RENUNCIA,
    sgrh_liquidaciones: liquidaciones,
  }
}

function mockHistorial(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_historial_laboral: result })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('getContratosPorLiquidar (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({} as never)
  })

  it('exige NOMINA_WRITE', async () => {
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(getContratosPorLiquidar()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.NOMINA_WRITE)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('pide solo contratos terminados (con fecha de fin)', async () => {
    const client = mockHistorial({ data: [], error: null })

    await getContratosPorLiquidar()

    const consulta = client.from.mock.results[0].value as { not: { mock: { calls: unknown[][] } } }
    expect(consulta.not.mock.calls).toContainEqual(['lab_fecha_fin', 'is', null])
  })

  // PostgREST devuelve la liquidación embebida como objeto o como arreglo.
  it('deja fuera los que ya tienen liquidación, venga como objeto o como arreglo', async () => {
    mockHistorial({
      data: [
        terminado(1, 'Ana', null),
        terminado(2, 'Bea', []),
        terminado(3, 'Carla', { liq_id: 7 }),
        terminado(4, 'Dora', [{ liq_id: 8 }]),
      ],
      error: null,
    })

    const result = await getContratosPorLiquidar()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((c) => c.historialLaboralId)).toEqual([1, 2])
  })

  it('arma el ítem con la fecha y el motivo que registró RRHH', async () => {
    mockHistorial({ data: [terminado(1, 'Ana', null)], error: null })

    const result = await getContratosPorLiquidar()

    expect(result).toEqual({
      ok: true,
      data: [
        {
          historialLaboralId: 1,
          nombre: 'Ana Mora',
          cedula: '1-0000-0000',
          fechaSalida: '2026-09-20',
          motivo: {
            nombre: 'Renuncia Voluntaria',
            generaCesantia: false,
            generaPreaviso: false,
            notaLegal: 'Sin responsabilidad patronal.',
          },
        },
      ],
    })
  })

  it('ordena por nombre', async () => {
    mockHistorial({
      data: [terminado(1, 'Zoe', null), terminado(2, 'Ana', null)],
      error: null,
    })

    const result = await getContratosPorLiquidar()

    expect(result.ok && result.data.map((c) => c.nombre)).toEqual(['Ana Mora', 'Zoe Mora'])
  })

  it('devuelve un error legible si la consulta falla', async () => {
    mockHistorial({ data: null, error: { message: 'boom' } })

    const result = await getContratosPorLiquidar()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron cargar los contratos por liquidar.',
    })
  })
})
