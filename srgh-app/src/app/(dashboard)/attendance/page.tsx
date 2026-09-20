import { Alert } from '@/components/ui/Alert'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ACCESO_ASISTENCIA } from '@/lib/permissions/zones'
import { getDailyAttendance } from '@/modules/attendance/actions/getDailyAttendance'
import { getMonthlyAttendanceSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { checkMonthlyInfractions } from '@/modules/attendance/actions/checkMonthlyInfractions'
import { AttendanceTabs } from '@/modules/attendance/components/AttendanceTabs'
import { DailyAttendanceTable } from '@/modules/attendance/components/DailyAttendanceTable'
import { MonthlySummaryTable } from '@/modules/attendance/components/MonthlySummaryTable'
import { PendingJustifications } from '@/modules/attendance/components/PendingJustifications'
import { buildJustificationQueue } from '@/modules/attendance/lib/pendingJustifications'
import {
  isValidISODate,
  monthBoundsInCostaRica,
  todayInCostaRica,
} from '@/modules/attendance/lib/time'

interface AttendancePageProps {
  searchParams?: { date?: string; month?: string } | Promise<{ date?: string; month?: string }>
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const claims = await requireAnyPermission(ACCESO_ASISTENCIA)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canReadDashboard = permisos.includes(PERMISOS.ASISTENCIA_READ)

  if (!canReadDashboard) {
    return (
      <Alert tone="info" size="md">
        Tu rol no tiene permiso para ver el panel de asistencia de la sucursal. Tu historial
        personal de marcas estara disponible en tu perfil.
      </Alert>
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
    <Alert size="md">{dailyResult.error}</Alert>
  )

  const resumenContent = monthlyResult.ok ? (
    <MonthlySummaryTable monthISO={monthISO} rows={monthlyResult.data} />
  ) : (
    <Alert size="md">{monthlyResult.error}</Alert>
  )

  // Justificar una tardia exige ASISTENCIA_WRITE; una ausencia, registrar una
  // ausencia aprobada (AUSENCIAS_APPROVE). Sin ninguno, no hay pestaña.
  const canJustifyAbsences = permisos.includes(PERMISOS.AUSENCIAS_APPROVE)
  const canJustify = canWrite || canJustifyAbsences

  const justificarContent = !canJustify ? undefined : monthlyResult.ok ? (
    <PendingJustifications
      monthISO={monthISO}
      rows={monthlyResult.data}
      canWrite={canWrite}
      canJustifyAbsences={canJustifyAbsences}
    />
  ) : (
    <Alert size="md">{monthlyResult.error}</Alert>
  )

  const pendingCount = monthlyResult.ok
    ? buildJustificationQueue(monthlyResult.data).pending.length
    : 0

  return (
    <AttendanceTabs
      diarioContent={diarioContent}
      resumenContent={resumenContent}
      justificarContent={justificarContent}
      pendingCount={pendingCount}
    />
  )
}
