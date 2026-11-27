import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { hmacField } from '@/lib/crypto/fieldCrypto'
import { ibanBankCode } from '@/modules/employees/lib/iban'
import type { DatosPagoInput } from '@/modules/employees/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ValidateDatosPagoResult =
  { ok: false; error: string; requiereConfirmacion?: true } | { ok: true; hmac: string | null }

/**
 * Validación server-side de los datos de pago, sobre TEXTO PLANO y antes de
 * cifrar. Devuelve además el índice ciego listo para persistir.
 *
 * Existe por dos razones que se juntaron:
 *
 *  1. La RPC crear_empleado_completo ya no puede validar el número — recibe
 *     ciphertext. Los chequeos que hacía en SQL viven acá.
 *  2. La misma validación estaba duplicada y DIVERGENTE: la RPC exigía
 *     ban_activo pero no verificaba el checksum; updateEmployee verificaba el
 *     código de entidad pero aceptaba bancos inactivos. Ahora hay un solo
 *     camino, y por eso la edición pasa a rechazar bancos inactivos igual que
 *     siempre hizo el alta.
 *
 * Lo que NO hace: formato y checksum del IBAN, que ya cubre el superRefine de
 * datosPagoSchema. Acá solo va lo que necesita consultar la base.
 */
export async function validateDatosPago(
  supabase: SupabaseServerClient,
  pago: DatosPagoInput | undefined,
  opts: { empIdActual?: number; confirmado?: boolean } = {}
): Promise<ValidateDatosPagoResult> {
  const cuenta = pago?.edp_numero_cuenta

  // Sin número no hay nada que validar ni que indexar. El HMAC va null, que es
  // lo que exige el constraint edp_cuenta_hmac_pareado cuando la cuenta es null.
  if (!pago || !cuenta) return { ok: true, hmac: null }

  // Backstop: datosPagoSchema ya rechaza una cuenta sin banco en su superRefine,
  // así que por la vía normal esto no se alcanza. Se conserva porque el banco es
  // lo que define la entidad del IBAN y ningún camino debería poder saltárselo.
  if (!pago.edp_banco_id) {
    return { ok: false, error: 'Seleccioná el banco de la cuenta.' }
  }

  const { data: banco, error: errBanco } = await supabase
    .from('sgrh_cat_bancos')
    .select('ban_codigo')
    .eq('ban_id', pago.edp_banco_id)
    .eq('ban_activo', true)
    .maybeSingle()

  if (errBanco || !banco) {
    return { ok: false, error: 'El banco seleccionado no es válido.' }
  }

  // SINPE Móvil usa el teléfono como destino, no un IBAN: no lleva código de
  // entidad embebido y no hay nada que contrastar contra el catálogo.
  if (
    pago.edp_tipo_cuenta !== 'SINPE' &&
    banco.ban_codigo &&
    ibanBankCode(cuenta) !== banco.ban_codigo
  ) {
    return { ok: false, error: 'El IBAN no corresponde al banco seleccionado.' }
  }

  // ─── Detección de cuentas repetidas ──────────────────────────────────────
  // El cifrado usa IV aleatorio, así que dos filas con el mismo número no se
  // parecen: la comparación va por el índice ciego vía RPC SECURITY DEFINER,
  // que revisa toda la empresa del usuario aunque el registro pertenezca a
  // otra sucursal (sin exponer filas de pago ni salario entre sucursales).
  const hmac = await hmacField(cuenta)

  const { data: repetidas, error: errRepetidas } = await supabase.rpc(
    'verificar_cuenta_pago_duplicada',
    {
      p_cuenta_hmac: hmac,
      ...(opts.empIdActual ? { p_excluir_emp_id: opts.empIdActual } : {}),
    }
  )

  // Falla cerrado: un error acá no puede degradarse en "seguí sin control".
  // Guardar es reintentable, saltarse un control antifraude en silencio no.
  if (errRepetidas || !Array.isArray(repetidas) || repetidas.length === 0) {
    return { ok: false, error: 'No se pudo verificar la cuenta bancaria. Intentá de nuevo.' }
  }

  const coincidencia = repetidas[0]
  if (coincidencia.duplicada && !opts.confirmado) {
    return {
      ok: false,
      requiereConfirmacion: true,
      error: `Esta cuenta ya está registrada para ${
        coincidencia.empleado_nombre?.trim() || 'otro empleado'
      }. Puede ser legítimo (una cuenta compartida) o un error de digitación.`,
    }
  }

  return { ok: true, hmac }
}
