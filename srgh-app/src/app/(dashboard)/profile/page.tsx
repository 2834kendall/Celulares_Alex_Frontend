import { createClient } from '@/lib/supabase/server'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { getRolNombre } from '@/lib/empresa/get-rol-nombre'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProfileInfo } from '@/modules/auth/components/ProfileInfo'
import { getMyMarks } from '@/modules/attendance/actions/getMyMarks'
import { MyAttendanceHistory } from '@/modules/attendance/components/MyAttendanceHistory'
import type { SgrhJwtClaims } from '@/types/auth'

export default async function ProfilePage() {
  // El layout del dashboard ya valido sesion y permisos
  const supabase = await createClient()
  const claimsRequest = supabase.auth.getClaims()
  // El nombre del rol depende solo de los claims: se encadena a ellos para que
  // viaje en paralelo con el resto. En una carga completa es la misma consulta
  // que ya hizo el layout (cache de React); al navegar desde otra pantalla el
  // layout no se vuelve a renderizar y la consulta es de esta página.
  const [{ data }, empresaNombre, marksResult, rol] = await Promise.all([
    claimsRequest,
    getEmpresaNombre(),
    getMyMarks(),
    claimsRequest.then((result) => {
      const codigo = (result.data?.claims?.app_metadata as Partial<SgrhJwtClaims> | undefined)?.rol
      return getRolNombre(typeof codigo === 'string' ? codigo : null)
    }),
  ])

  const claims = data?.claims

  return (
    <div className="space-y-6">
      {/* Mismo ancho que las dos tarjetas (centradas en max-w-2xl), para que el
          titulo arranque alineado con ellas y no pegado al borde del contenido. */}
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Mi perfil" />
      </div>
      <ProfileInfo
        email={typeof claims?.email === 'string' ? claims.email : 'Usuario autenticado'}
        rol={rol}
        empresaNombre={empresaNombre}
      />
      <MyAttendanceHistory data={marksResult.ok ? marksResult.data : []} />
    </div>
  )
}
