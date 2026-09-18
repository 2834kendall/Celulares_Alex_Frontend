import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getScheduledEmployees } from '@/modules/attendance/actions/getScheduledEmployees'
import { KioskScreen } from '@/modules/attendance/components/kiosk/KioskScreen'

export default async function KioscoPage() {
  await requirePermission(PERMISOS.ASISTENCIA_WRITE)

  const result = await getScheduledEmployees()

  if (!result.ok) {
    return (
      <div className="text-center text-slate-300">
        <p>{result.error}</p>
      </div>
    )
  }

  return <KioskScreen employees={result.data} />
}
