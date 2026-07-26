import { Info } from 'lucide-react'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ACCESO_ASISTENCIA } from '@/lib/permissions/zones'
import { getDailyAttendance } from '@/modules/attendance/actions/getDailyAttendance'
import { DailyAttendanceTable } from '@/modules/attendance/components/DailyAttendanceTable'
import { isValidISODate, todayInCostaRica } from '@/modules/attendance/lib/time'

interface AttendancePageProps {
  searchParams?: { date?: string } | Promise<{ date?: string }>
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const claims = await requireAnyPermission(ACCESO_ASISTENCIA)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canReadDashboard = permisos.includes(PERMISOS.ASISTENCIA_READ)

  if (!canReadDashboard) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Tu rol no tiene permiso para ver el panel de asistencia de la sucursal. Tu historial
          personal de marcas estara disponible en tu perfil.
        </p>
      </div>
    )
  }

  const resolvedSearchParams = await Promise.resolve(searchParams)
  const dateParam = resolvedSearchParams?.date
  const dateISO = dateParam && isValidISODate(dateParam) ? dateParam : todayInCostaRica()

  const result = await getDailyAttendance(dateISO)

  if (!result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <p>{result.error}</p>
      </div>
    )
  }

  const canWrite = permisos.includes(PERMISOS.ASISTENCIA_WRITE)

  return <DailyAttendanceTable dateISO={result.date} rows={result.data} canWrite={canWrite} />
}
