import { Info } from 'lucide-react'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ACCESO_ASISTENCIA } from '@/lib/permissions/zones'
import { getDailyAttendance } from '@/modules/attendance/actions/getDailyAttendance'
import { getMonthlyAttendanceSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { checkMonthlyInfractions } from '@/modules/attendance/actions/checkMonthlyInfractions'
import { AttendanceTabs } from '@/modules/attendance/components/AttendanceTabs'
import { DailyAttendanceTable } from '@/modules/attendance/components/DailyAttendanceTable'
import { MonthlySummaryTable } from '@/modules/attendance/components/MonthlySummaryTable'
import {
  isValidISODate,
  monthBoundsInCostaRica,
  todayInCostaRica,
} from '@/modules/attendance/lib/time'

interface AttendancePageProps {
  searchParams?: { date?: string; month?: string } | Promise<{ date?: string; month?: string }>
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
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

  const monthParam = resolvedSearchParams?.month
  const monthISO =
    monthParam && isValidISODate(monthParam)
      ? monthParam
      : monthBoundsInCostaRica(todayInCostaRica()).start

  // Bajo demanda, mejor esfuerzo: revisa tardias/ausencias del mes en curso y
  // dispara la advertencia en sgrh_notificaciones si corresponde (RF-07/RF-08).
  // No debe romper el panel si falla, por eso se ignora su resultado.
  const [dailyResult, monthlyResult] = await Promise.all([
    getDailyAttendance(dateISO),
    getMonthlyAttendanceSummary({ fecha: monthISO }),
    checkMonthlyInfractions().catch(() => undefined),
  ])

  const canWrite = permisos.includes(PERMISOS.ASISTENCIA_WRITE)

  const diarioContent = dailyResult.ok ? (
    <DailyAttendanceTable dateISO={dailyResult.date} rows={dailyResult.data} canWrite={canWrite} />
  ) : (
    <ErrorBanner message={dailyResult.error} />
  )

  const resumenContent = monthlyResult.ok ? (
    <MonthlySummaryTable monthISO={monthISO} rows={monthlyResult.data} />
  ) : (
    <ErrorBanner message={monthlyResult.error} />
  )

  return <AttendanceTabs diarioContent={diarioContent} resumenContent={resumenContent} />
}
