#!/usr/bin/env node
/**
 * Backfill: cifra los números de cuenta que ya existen en
 * sgrh_empleado_datos_pago y calcula su índice ciego.
 *
 *   pnpm encrypt:payment-data            # dry-run, NO escribe
 *   pnpm encrypt:payment-data -- --apply # escribe de verdad
 *
 * Corre contra el proyecto configurado en .env.local (el mismo al que apunta la
 * app), no contra el que tenga vinculado el CLI de Supabase. Ojo con eso si
 * manejás más de un proyecto.
 *
 * ── Por qué es un script de Node y no un .sql ───────────────────────────
 * La llave vive en la aplicación; Postgres no puede cifrar porque no la tiene
 * (que es justamente el punto del diseño). Por eso este backfill no puede
 * vivir en supabase/scripts/ como los demás. La parte que SÍ es SQL —validar
 * los constraints una vez que no queda nada en claro— sí está allá, en
 * supabase/scripts/validar-cuentas-cifradas.sql, y se corre después de este.
 *
 * ── Idempotente ─────────────────────────────────────────────────────────
 * Igual que los seeds, y por el mismo motivo: no hay ledger que registre si ya
 * se aplicó. Re-correrlo no cambia nada. Las filas se clasifican en tres casos:
 *
 *   1. texto plano            → cifrar + calcular HMAC
 *   2. cifrada sin HMAC       → descifrar, calcular HMAC (queda de la ventana
 *                               entre el deploy y este backfill)
 *   3. cifrada y con HMAC     → no se toca
 *
 * ── Nota sobre el import ────────────────────────────────────────────────
 * Corre con `node --experimental-strip-types`, que borra los tipos pero no
 * resuelve nada: los imports llevan la extensión .ts explícita, y cualquier
 * tipo tendría que entrar con `import type`. Por eso importa fieldCrypto.core
 * (cripto pura, sin 'server-only') y no el wrapper.
 */

import { createClient } from '@supabase/supabase-js'
import {
  decryptField,
  encryptField,
  hmacField,
  isEncrypted,
} from '../src/lib/crypto/fieldCrypto.core.ts'
import { normalizeIban } from '../src/modules/employees/lib/iban.ts'

interface Fila {
  edp_id: number
  edp_numero_cuenta: string | null
  edp_cuenta_hmac: string | null
}

async function main() {
  const apply = process.argv.includes('--apply')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY
  const indexKey = process.env.FIELD_INDEX_KEY

  if (!url || !secretKey || !encryptionKey || !indexKey) {
    throw new Error(
      'Faltan variables de entorno. Se necesitan NEXT_PUBLIC_SUPABASE_URL,\n' +
        'SUPABASE_SECRET_KEY, FIELD_ENCRYPTION_KEY y FIELD_INDEX_KEY.\n\n' +
        'Corré el script con `pnpm encrypt:payment-data`, que ya carga .env.local.'
    )
  }

  // Secret key: el backfill toca filas de TODAS las empresas, así que no puede
  // ir con el cliente de sesión (la RLS lo acotaría a una sola).
  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  /** Trae todas las filas con cuenta, paginando: PostgREST corta en 1000. */
  async function traerFilas(): Promise<Fila[]> {
    const filas: Fila[] = []
    const tamano = 1000

    for (let desde = 0; ; desde += tamano) {
      const { data, error } = await supabase
        .from('sgrh_empleado_datos_pago')
        .select('edp_id, edp_numero_cuenta, edp_cuenta_hmac')
        .not('edp_numero_cuenta', 'is', null)
        .order('edp_id')
        .range(desde, desde + tamano - 1)

      if (error) {
        throw new Error(
          `No se pudieron leer los datos de pago: ${error.message}\n\n` +
            '¿Está aplicada la migración 20260824120000_datos_pago_cifrado?\n' +
            'Corré `pnpm supabase:migrate:push` antes de este backfill.'
        )
      }

      filas.push(...(data as Fila[]))
      if (!data || data.length < tamano) return filas
    }
  }

  const filas = await traerFilas()

  let yaListas = 0
  let cifradas = 0
  let soloHmac = 0
  const ilegibles: number[] = []

  console.log(
    `\n${apply ? 'APLICANDO' : 'DRY-RUN (no escribe nada)'} — ${filas.length} filas con cuenta.\n`
  )

  for (const fila of filas) {
    const almacenado = fila.edp_numero_cuenta
    if (!almacenado) continue

    // Caso 3: nada que hacer.
    if (isEncrypted(almacenado) && fila.edp_cuenta_hmac) {
      yaListas++
      continue
    }

    let plano: string

    if (isEncrypted(almacenado)) {
      // Caso 2: el ciphertext está bien, falta el índice. Hay que descifrar para
      // poder calcularlo — el HMAC va sobre el texto plano, no sobre el cifrado.
      const descifrado = await decryptField(almacenado, encryptionKey)
      if (!descifrado.ok || !descifrado.value) {
        // No se corrige sola: o la llave no es la que cifró esta fila, o el dato
        // está alterado. Se reporta y se deja intacta — sobrescribirla sería
        // destruir la única copia.
        ilegibles.push(fila.edp_id)
        continue
      }
      plano = descifrado.value
    } else {
      // Caso 1: texto plano de antes del cifrado.
      plano = almacenado
    }

    // Se normaliza igual que en el formulario (mayúsculas, sin separadores). Si
    // el HMAC se calculara sobre el texto crudo, 'CR05 0152…' y 'cr050152…'
    // darían índices distintos y la detección de duplicados no serviría.
    const normalizado = normalizeIban(plano)
    const hmac = await hmacField(normalizado, indexKey)

    // Las dos columnas se escriben juntas cuando hay que cifrar (constraint
    // edp_cuenta_hmac_pareado); en el caso 2 el ciphertext ya está bien y solo
    // falta el índice, así que se toca una sola columna.
    const yaCifrada = isEncrypted(almacenado)
    const cambios = yaCifrada
      ? { edp_cuenta_hmac: hmac }
      : {
          edp_numero_cuenta: await encryptField(normalizado, encryptionKey),
          edp_cuenta_hmac: hmac,
        }

    if (apply) {
      const { error } = await supabase
        .from('sgrh_empleado_datos_pago')
        .update(cambios)
        .eq('edp_id', fila.edp_id)

      if (error) {
        console.error(`  edp_id ${fila.edp_id}: ${error.message}`)
        continue
      }
    }

    if (yaCifrada) soloHmac++
    else cifradas++
  }

  console.log(`  Ya cifradas y con índice ....... ${yaListas}`)
  console.log(`  Por cifrar (texto plano) ....... ${cifradas}`)
  console.log(`  Por indexar (ya cifradas) ...... ${soloHmac}`)

  if (ilegibles.length > 0) {
    console.log(`  ⚠️  Ilegibles, SIN TOCAR ......... ${ilegibles.length}`)
    console.log(`     edp_id: ${ilegibles.join(', ')}`)
    console.log(
      '\n     Están cifradas con otra llave o el dato fue alterado. No se sobrescriben:\n' +
        '     hacerlo destruiría la única copia. Revisá que FIELD_ENCRYPTION_KEY sea la\n' +
        '     que cifró estas filas antes de volver a correr.'
    )
  }

  if (!apply && cifradas + soloHmac > 0) {
    console.log('\nNada de esto se escribió. Volvé a correr con --apply cuando el conteo cuadre.')
  }

  if (apply && cifradas + soloHmac > 0) {
    console.log(
      '\nListo. Ahora cerrá la migración validando los constraints:\n' +
        '  supabase db query --linked -f supabase/scripts/validar-cuentas-cifradas.sql'
    )
  }

  console.log('')
}

// Sin process.exit(): con los sockets del cliente de Supabase todavía abiertos,
// matar el proceso a mano dispara un assert de libuv en Windows y el script
// "falla" con un crash en vez de con su propio mensaje. Marcar exitCode y dejar
// que Node termine solo da el código de salida correcto y una salida limpia.
try {
  await main()
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
