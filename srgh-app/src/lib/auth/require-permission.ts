import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Permiso } from '@/lib/permissions/catalog'

export async function requirePermission(requiredPermission: Permiso) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const permisos = (user.app_metadata?.permisos as string[]) || []

  if (!permisos.includes(requiredPermission)) {
    redirect('/unauthorized')
  }

  return user
}
