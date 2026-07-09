import { createClient } from '@/lib/supabase/server'
import { ProfileInfo } from '@/modules/auth/components/ProfileInfo'
import type { SgrhJwtClaims } from '@/types/auth'

export default async function ProfilePage() {
  // El layout del dashboard ya valido sesion y permisos
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  const claims = data?.claims
  const meta = (claims?.app_metadata ?? {}) as Partial<SgrhJwtClaims>

  return (
    <ProfileInfo
      email={typeof claims?.email === 'string' ? claims.email : 'Usuario autenticado'}
      rol={typeof meta.rol === 'string' ? meta.rol : null}
    />
  )
}
