import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerKioskMark } from './registerKioskMark'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { KioskMarkInput } from '@/modules/attendance/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: KioskMarkInput = {
  employeeId: 10,
  tipo: 'entrada',
  latitud: null,
  longitud: null,
  pin: null,
  dispositivoId: null,
}

describe('registerKioskMark (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 999, empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos invalidos sin llamar a requirePermission', async () => {
    const result = await registerKioskMark({ ...validInput, tipo: 'ALMUERZO' as never })

    expect(result).toEqual({ ok: false, error: 'Datos de marca invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('falla si el empleado no tiene un contrato activo', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({ ok: false, error: 'El empleado no tiene un contrato activo.' })
  })

  it('rechaza un PIN incorrecto sin registrar la marca', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: { lab_id: 1, lab_sucursal_id: 100 }, error: null },
      sgrh_empleados: { data: { emp_fecha_nacimiento: '1990-01-01' }, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark({ ...validInput, pin: '1999' })

    expect(result).toEqual({ ok: false, error: 'PIN incorrecto.' })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('registra la marca con MANUAL y observacion automatica cuando el PIN es correcto', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: { lab_id: 1, lab_sucursal_id: 100 }, error: null },
      sgrh_empleados: { data: { emp_fecha_nacimiento: '1990-01-01' }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark({ ...validInput, pin: '1990' })

    expect(result).toEqual({ ok: true })

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        mar_historial_laboral_id: 1,
        mar_sucursal_id: 100,
        mar_tipo: 'entrada',
        mar_metodo_verificacion: 'MANUAL',
        mar_registrado_por_id: 999,
        mar_observacion: 'Marcado con PIN de respaldo (camara no disponible).',
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
  })

  it('registra sin PIN (mock de camara) tambien como MANUAL y sin observacion', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: { lab_id: 1, lab_sucursal_id: 100 }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_empleados')

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mar_metodo_verificacion: 'MANUAL', mar_observacion: null })
    )
  })

  it('calcula la distancia a la sucursal cuando vienen coordenadas', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: { lab_id: 1, lab_sucursal_id: 100 }, error: null },
      sgrh_sucursales: { data: { suc_latitud: 9.9333, suc_longitud: -84.0833 }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark({
      ...validInput,
      latitud: 9.9333,
      longitud: -84.0833,
    })

    expect(result).toEqual({ ok: true })

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mar_distancia_geocerca_metros: 0 })
    )
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: { lab_id: 1, lab_sucursal_id: 100 }, error: null },
        sgrh_marcas_asistencia: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo registrar la marca.' })
  })
})
