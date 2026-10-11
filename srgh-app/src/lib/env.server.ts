import 'server-only'
import { z } from 'zod'

// Variables exclusivas de servidor. A diferencia de env.ts (que valida al
// importar), aquí la validación es lazy: build, lint y tests no requieren la
// secret key — solo falla en runtime cuando una action admin la necesita.
const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY must be a non-empty string'),
})

type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse({
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    })

    if (!parsed.success) {
      console.error('❌ Invalid server environment variables:', parsed.error.format())
      throw new Error('Missing or invalid server environment variables')
    }

    cached = parsed.data
  }

  return cached
}

// ─── Llaves de cifrado de campos ─────────────────────────────────────────────
// Schema y cache PROPIOS, deliberadamente fuera de getServerEnv(): a esa la
// llama createAdminClient(), así que meter las llaves ahí haría que los flujos
// de usuarios y storage explotaran por una variable que no usan. Cada secreto
// falla solo donde se necesita.
//
// FIELD_ENCRYPTION_KEY es reversible y protege el dato; FIELD_INDEX_KEY genera
// el HMAC que permite comparar sin leer. Van separadas para que rotar una no
// obligue a rotar la otra, y para que comprometer una no entregue la otra.
//
// ⚠️ Si se pierde FIELD_ENCRYPTION_KEY, los datos cifrados son irrecuperables.
// Respaldarla fuera del .env.local. Generar ambas con: openssl rand -base64 32
const cryptoKeysSchema = z.object({
  FIELD_ENCRYPTION_KEY: z.string().min(1, 'FIELD_ENCRYPTION_KEY must be a non-empty string'),
  FIELD_INDEX_KEY: z.string().min(1, 'FIELD_INDEX_KEY must be a non-empty string'),
})

type CryptoKeys = z.infer<typeof cryptoKeysSchema>

let cachedCryptoKeys: CryptoKeys | null = null

export function getCryptoKeys(): CryptoKeys {
  if (!cachedCryptoKeys) {
    const parsed = cryptoKeysSchema.safeParse({
      FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY,
      FIELD_INDEX_KEY: process.env.FIELD_INDEX_KEY,
    })

    if (!parsed.success) {
      console.error('❌ Invalid field encryption keys:', parsed.error.format())
      throw new Error('Missing or invalid field encryption keys')
    }

    cachedCryptoKeys = parsed.data
  }

  return cachedCryptoKeys
}
