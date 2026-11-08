import { describe, expect, it, vi } from 'vitest'
import { avisoAguinaldoAnterior } from './liquidacionData'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))

type Cliente = Parameters<typeof avisoAguinaldoAnterior>[0]

function cliente(pagos: unknown[], provisiones: unknown[] = []) {
  return createSupabaseClientMock({
    sgrh_provisiones_anuales: { data: provisiones, error: null },
    sgrh_pagos_extraordinarios: { data: pagos, error: null },
  }) as unknown as Cliente
}

const CICLO = { anio: 2026, monto: 430000, labIds: [7] }
const NO_INCLUIDO = 'no consta como pagado y NO está incluido en esta liquidación'

describe('avisoAguinaldoAnterior', () => {
  it('con un pago vigente no avisa', async () => {
    expect(
      await avisoAguinaldoAnterior(cliente([{ pex_id: 3, pex_anulado_en: null }]), CICLO)
    ).toBeNull()
  })

  it('un pago anulado no cuenta: avisa que no está incluido', async () => {
    const aviso = await avisoAguinaldoAnterior(
      cliente([{ pex_id: 3, pex_anulado_en: '2026-12-10T18:00:00+00:00' }]),
      CICLO
    )
    expect(aviso).toContain(NO_INCLUIDO)
  })

  it('la marca de la provisión solo vale sin pagos registrados (botón viejo)', async () => {
    const provision = [{ pra_historial_laboral_id: 7, pra_aguinaldo_pagado: true }]
    expect(await avisoAguinaldoAnterior(cliente([], provision), CICLO)).toBeNull()
    // Con el pago anulado, una marca que quedó en true no lo da por pagado.
    const aviso = await avisoAguinaldoAnterior(
      cliente([{ pex_id: 3, pex_anulado_en: '2026-12-10T18:00:00+00:00' }], provision),
      CICLO
    )
    expect(aviso).toContain(NO_INCLUIDO)
  })

  it('sin pagos ni marca avisa', async () => {
    expect(await avisoAguinaldoAnterior(cliente([]), CICLO)).toContain(NO_INCLUIDO)
  })
})
