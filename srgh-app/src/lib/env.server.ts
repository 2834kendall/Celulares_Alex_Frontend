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
