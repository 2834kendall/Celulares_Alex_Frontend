import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createClient } from '@/lib/supabase/server'
import { createAusencia } from '@/modules/absences/actions/createAusencia'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { justifySecondBlock } from './justifySecondBlock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/modules/absences/actions/createAusencia', () => ({ createAusencia: vi.fn() }))

const input = { employmentHistoryId: 1, date: '2026-07-25', tipoAusenciaId: 7, motivo: 'Cita' }

function mockClient(percentage: number, requiresCcss = false) {
  const client = createSupabaseClientMock({
    sgrh_programacion_semanal: {
      data: [
        { prg_sucursal_id: 100, prg_hora_entrada_custom: '08:00', prg_hora_salida_custom: '12:00' },
        { prg_sucursal_id: 200, prg_hora_entrada_custom: '18:00', prg_hora_salida_custom: '23:00' },
      ],
      error: null,
    },
    sgrh_cat_tipos_ausencia: {
      data: {
        tau_requiere_documento_ccss: requiresCcss,
        tau_porcentaje_pago_empleador: percentage,
        tau_es_intradia: false,
      },
      error: null,
    },
    sgrh_justificaciones_bloque: { data: null, error: null },
  })
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return client
}

describe('justifySecondBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue({
      app_metadata: { usr_id: 5, empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it.each([
    [0, false],
    [100, true],
  ])('records unpaid relief for the second branch (%s, CCSS %s)', async (percentage, ccss) => {
    const client = mockClient(percentage, ccss)

    expect(await justifySecondBlock(input)).toEqual({ ok: true })
    expect(requirePermission).toHaveBeenCalledWith(PERMISOS.AUSENCIAS_APPROVE)
    expect(createAusencia).not.toHaveBeenCalled()
    const insert = client.from.mock.results[2].value.insert
    expect(insert).toHaveBeenCalledWith({
      jbl_empresa_id: 1,
      jbl_historial_laboral_id: 1,
      jbl_sucursal_id: 200,
      jbl_fecha: input.date,
      jbl_bloque: 2,
      jbl_tipo_ausencia_id: 7,
      jbl_fraccion_pagada: 0,
      jbl_motivo: 'Cita',
      jbl_registrado_por_id: 5,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
  })

  it('delegates paid relief to the existing full-day absence action', async () => {
    const client = mockClient(50)
    vi.mocked(createAusencia).mockResolvedValue({ ok: true })

    expect(await justifySecondBlock(input)).toEqual({ ok: true })
    expect(createAusencia).toHaveBeenCalledWith({
      employmentHistoryId: 1,
      tipoAusenciaId: 7,
      fechaInicio: input.date,
      fechaFin: input.date,
      observaciones: 'Cita',
    })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_justificaciones_bloque')
  })
})
