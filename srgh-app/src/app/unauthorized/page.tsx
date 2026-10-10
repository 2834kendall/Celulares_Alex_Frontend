import { createClient } from '@/lib/supabase/server'
import { AccessDenied } from '@/modules/auth/components/AccessDenied'
import { accessExit } from '@/modules/auth/lib/accessExit'

export default async function UnauthorizedPage() {
  // Solo para elegir la salida (ver accessExit): la pagina no muestra datos.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  return <AccessDenied exit={accessExit(data?.claims)} />
}
