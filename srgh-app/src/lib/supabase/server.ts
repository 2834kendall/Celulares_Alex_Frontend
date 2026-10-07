import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'
import { env } from '@/lib/env'
import { timedFetch } from './timedFetch'

/**
 * Un cliente por request: `cache` lo memoiza mientras dura el render, así que
 * el layout, la página y los guards de cada acción comparten la misma
 * instancia. Fuera de un render (tests, route handlers) `cache` no memoiza y
 * cada llamada crea uno nuevo, como antes.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method can be called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      global: timedFetch ? { fetch: timedFetch } : undefined,
    }
  )
})
