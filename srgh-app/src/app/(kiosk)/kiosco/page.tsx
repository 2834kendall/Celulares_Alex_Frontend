import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getActiveEmployees } from '@/modules/attendance/actions/getActiveEmployees'
import { KioskScreen } from '@/modules/attendance/components/kiosk/KioskScreen'

export default async function KioscoPage() {
  await requirePermission(PERMISOS.ASISTENCIA_WRITE)

  const result = await getActiveEmployees()

  if (!result.ok) {
    return (
      <div className="text-center text-slate-300">
        <p>{result.error}</p>
      </div>
    )
  }

  return <KioskScreen employees={result.data} />
}
