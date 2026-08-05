import { createClient } from '@/lib/supabase/server'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { ProfileInfo } from '@/modules/auth/components/ProfileInfo'
import { getMyMarks } from '@/modules/attendance/actions/getMyMarks'
import { MyAttendanceHistory } from '@/modules/attendance/components/MyAttendanceHistory'
import type { SgrhJwtClaims } from '@/types/auth'

export default async function ProfilePage() {
  // El layout del dashboard ya valido sesion y permisos
  const supabase = await createClient()
  const [{ data }, empresaNombre, marksResult] = await Promise.all([
    supabase.auth.getClaims(),
    getEmpresaNombre(),
    getMyMarks(),
  ])

  const claims = data?.claims
  const meta = (claims?.app_metadata ?? {}) as Partial<SgrhJwtClaims>

  return (
    <div className="space-y-6">
      <ProfileInfo
        email={typeof claims?.email === 'string' ? claims.email : 'Usuario autenticado'}
        rol={typeof meta.rol === 'string' ? meta.rol : null}
        empresaNombre={empresaNombre}
      />
      <MyAttendanceHistory data={marksResult.ok ? marksResult.data : []} />
    </div>
  )
}
