import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateDatosPago } from './validateDatosPago'
import type { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

// validateDatosPago y fieldCrypto importan 'server-only', que revienta fuera de
// Next.js (ver planillaExcel.test.ts).
vi.mock('server-only', () => ({}))
vi.mock('@/lib/crypto/fieldCrypto', () => ({
  // Determinístico y legible: el HMAC real se prueba en fieldCrypto.core.test.ts.
  hmacField: vi.fn(async (valor: string) => `hmac:${valor}`),
}))

const IBAN_BAC = 'CR02010200000000000001' // código de entidad 102
const SINPE = '88887777'

function cliente(
  responses: Parameters<typeof createSupabaseClientMock>[0],
  rpcResponses?: Parameters<typeof createSupabaseClientMock>[1] extends infer O
    ? O extends { rpcResponses?: infer R }
      ? R
      : never
    : never
) {
  const client = createSupabaseClientMock(responses, { rpcResponses })
  return {
    client,
    supabase: client as unknown as Awaited<ReturnType<typeof createClient>>,
  }
}

const BAC = { data: { ban_codigo: '102' }, error: null }
const SIN_REPETIDAS = { data: [{ duplicada: false, empleado_nombre: null }], error: null }

describe('validateDatosPago', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no consulta nada si no vienen datos de pago', async () => {
    const { client, supabase } = cliente({})

    await expect(validateDatosPago(supabase, undefined)).resolves.toEqual({ ok: true, hmac: null })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('devuelve hmac null cuando hay banco pero no número', async () => {
    const { client, supabase } = cliente({})

    // El constraint edp_cuenta_hmac_pareado exige que si la cuenta va null, el
    // índice también.
    await expect(validateDatosPago(supabase, { edp_banco_id: 3 })).resolves.toEqual({
      ok: true,
      hmac: null,
    })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('rechaza un banco inexistente o inactivo', async () => {
    // La query filtra por ban_activo, así que un banco desactivado no devuelve fila.
    const { supabase } = cliente({ sgrh_cat_bancos: { data: null, error: null } })

    await expect(
      validateDatosPago(supabase, { edp_banco_id: 99, edp_numero_cuenta: IBAN_BAC })
    ).resolves.toEqual({ ok: false, error: 'El banco seleccionado no es válido.' })
  })

  it('rechaza un IBAN cuyo código de entidad no es el del banco elegido', async () => {
    const { supabase } = cliente({
      sgrh_cat_bancos: { data: { ban_codigo: '151' }, error: null }, // Banco Nacional
    })

    await expect(
      validateDatosPago(supabase, { edp_banco_id: 5, edp_numero_cuenta: IBAN_BAC })
    ).resolves.toEqual({ ok: false, error: 'El IBAN no corresponde al banco seleccionado.' })
  })

  it('no exige código de entidad en SINPE (es un teléfono, no un IBAN)', async () => {
    const { supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      { verificar_cuenta_pago_duplicada: SIN_REPETIDAS }
    )

    await expect(
      validateDatosPago(supabase, {
        edp_banco_id: 3,
        edp_tipo_cuenta: 'SINPE',
        edp_numero_cuenta: SINPE,
      })
    ).resolves.toEqual({ ok: true, hmac: `hmac:${SINPE}` })
  })

  it('devuelve el hmac cuando todo está bien', async () => {
    const { supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      { verificar_cuenta_pago_duplicada: SIN_REPETIDAS }
    )

    await expect(
      validateDatosPago(supabase, { edp_banco_id: 3, edp_numero_cuenta: IBAN_BAC })
    ).resolves.toEqual({ ok: true, hmac: `hmac:${IBAN_BAC}` })
  })

  // ── Detección de cuentas repetidas ────────────────────────────────────────

  it('pide confirmación si la cuenta ya está en otro empleado', async () => {
    const { supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      {
        verificar_cuenta_pago_duplicada: {
          data: [{ duplicada: true, empleado_nombre: 'María Rodríguez' }],
          error: null,
        },
      }
    )

    const result = await validateDatosPago(supabase, {
      edp_banco_id: 3,
      edp_numero_cuenta: IBAN_BAC,
    })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ requiereConfirmacion: true })
    expect(result.ok === false && result.error).toContain('María Rodríguez')
  })

  it('deja pasar el duplicado cuando el usuario ya confirmó', async () => {
    // Compartir cuenta puede ser legítimo (cónyuges): se avisa, no se bloquea.
    const { supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      {
        verificar_cuenta_pago_duplicada: {
          data: [{ duplicada: true, empleado_nombre: 'María Rodríguez' }],
          error: null,
        },
      }
    )

    await expect(
      validateDatosPago(
        supabase,
        { edp_banco_id: 3, edp_numero_cuenta: IBAN_BAC },
        { confirmado: true }
      )
    ).resolves.toEqual({ ok: true, hmac: `hmac:${IBAN_BAC}` })
  })

  it('avisa sin nombre si la RPC no trae empleado_nombre', async () => {
    const { supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      {
        verificar_cuenta_pago_duplicada: {
          data: [{ duplicada: true, empleado_nombre: null }],
          error: null,
        },
      }
    )

    const result = await validateDatosPago(supabase, {
      edp_banco_id: 3,
      edp_numero_cuenta: IBAN_BAC,
    })

    // El aviso sigue sirviendo sin el nombre; no vale abortar por esto.
    expect(result.ok === false && result.error).toContain('otro empleado')
  })

  it('excluye al propio empleado al editar', async () => {
    const { client, supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      { verificar_cuenta_pago_duplicada: SIN_REPETIDAS }
    )

    await validateDatosPago(
      supabase,
      { edp_banco_id: 3, edp_numero_cuenta: IBAN_BAC },
      { empIdActual: 10 }
    )

    // Sin p_excluir_emp_id, guardar una ficha sin tocar la cuenta se detectaría a sí misma.
    expect(client.rpc).toHaveBeenCalledWith('verificar_cuenta_pago_duplicada', {
      p_cuenta_hmac: `hmac:${IBAN_BAC}`,
      p_excluir_emp_id: 10,
    })
  })

  it('falla cerrado si la consulta de duplicados revienta', async () => {
    const { supabase } = cliente(
      { sgrh_cat_bancos: BAC },
      { verificar_cuenta_pago_duplicada: { data: null, error: { message: 'boom' } } }
    )

    // Guardar es reintentable; saltarse un control antifraude en silencio, no.
    await expect(
      validateDatosPago(supabase, { edp_banco_id: 3, edp_numero_cuenta: IBAN_BAC })
    ).resolves.toEqual({
      ok: false,
      error: 'No se pudo verificar la cuenta bancaria. Intentá de nuevo.',
    })
  })

  it('rechaza una cuenta sin banco (backstop del schema)', async () => {
    const { client, supabase } = cliente({})

    await expect(validateDatosPago(supabase, { edp_numero_cuenta: IBAN_BAC })).resolves.toEqual({
      ok: false,
      error: 'Seleccioná el banco de la cuenta.',
    })
    expect(client.from).not.toHaveBeenCalled()
  })
})
