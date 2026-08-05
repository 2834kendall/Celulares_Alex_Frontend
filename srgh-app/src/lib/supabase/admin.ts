import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { env } from '@/lib/env'
import { getServerEnv } from '@/lib/env.server'

// Cliente con la secret key: bypasea RLS y accede a la API admin de Auth.
// Solo para Server Actions que ya validaron entrada y permisos vía JWT
// (p. ej. altas multi-tabla cuyo RETURNING es invisible bajo RLS).
export function createAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
