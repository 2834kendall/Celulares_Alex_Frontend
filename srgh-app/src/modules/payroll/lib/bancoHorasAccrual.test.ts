import { describe, expect, it, vi } from 'vitest'
import { sincronizarMovimientoBancoHoras } from './bancoHorasAccrual'
import { createSupabaseClientMock } from '@/test/supabaseMock'

// bancoHorasAccrual.ts importa 'server-only', que revienta fuera de Next.js
// (ver planillaExcel.test.ts para la misma explicación).
vi.mock('server-only', () => ({}))

const BASE = { ndtId: 10, historialLaboralId: 5, salarioPorHora: 2500 }

function client(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  return createSupabaseClientMock(responses) as unknown as Parameters<
    typeof sincronizarMovimientoBancoHoras
  >[0]
}

describe('sincronizarMovimientoBancoHoras', () => {
  it('sin horas extra y sin movimiento previo: no hace nada más que revisar', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 80,
    })

    expect(result).toEqual({ error: null })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('sin horas extra pero con un movimiento pendiente: lo elimina', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: [
        { data: { bhm_id: 77, bhm_estado: 'pendiente' }, error: null },
        { data: null, error: null },
      ],
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 80,
    })

    expect(result).toEqual({ error: null })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('sin horas extra pero con un movimiento ya pagado: lo deja intacto (no lo borra)', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: { data: { bhm_id: 77, bhm_estado: 'pagado' }, error: null },
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 80,
    })

    expect(result).toEqual({ error: null })
    // Solo el select: ningún delete/update sobre un movimiento ya resuelto.
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('con horas extra y sin movimiento previo: crea uno pendiente', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 96,
    })

    expect(result).toEqual({ error: null })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('con horas extra y un movimiento pendiente existente: lo actualiza', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: [
        { data: { bhm_id: 77, bhm_estado: 'pendiente' }, error: null },
        { data: null, error: null },
      ],
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 96,
    })

    expect(result).toEqual({ error: null })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('con horas extra pero un movimiento ya compensado: lo deja intacto (historial no se toca)', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: { data: { bhm_id: 77, bhm_estado: 'compensado' }, error: null },
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 96,
    })

    expect(result).toEqual({ error: null })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('si falla la revisión inicial, devuelve error sin intentar nada más', async () => {
    const supabase = client({
      sgrh_banco_horas_movimientos: { data: null, error: { message: 'boom' } },
    })

    const result = await sincronizarMovimientoBancoHoras(supabase, {
      ...BASE,
      horasTrabajadas: 96,
    })

    expect(result).toEqual({ error: 'No se pudo revisar el banco de horas.' })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})
