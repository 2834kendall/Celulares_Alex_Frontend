import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
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
  // La barra superior ya no muestra el titulo de la ruta: el encabezado va en
  // todas las ramas, incluida la de error, o la pantalla queda sin titulo.
  const header = <PageHeader title="Asistencia" />

  if (!canReadDashboard) {
    return (
      <div className="min-w-0 space-y-4">
        {header}
        <Alert tone="info" size="md">
          Tu rol no tiene permiso para ver el panel de asistencia de la sucursal. Tu historial
          personal de marcas estará disponible en tu perfil.
        </Alert>
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
  // Justificar una tardía y registrar una ausencia aprobada tienen permisos distintos.
  const canJustifyAbsences = permisos.includes(PERMISOS.AUSENCIAS_APPROVE)
  const canJustify = canWrite || canJustifyAbsences
  const pendingCount = monthlyResult.ok
    ? buildJustificationQueue(monthlyResult.data).pending.length
    : 0
  const pendingParams = new URLSearchParams({ tab: 'justificar' })
  // El enlace lleva al mismo mes para el que se calculó el aviso.
  if (monthParam) pendingParams.set('month', monthISO)
  if (dateParam) pendingParams.set('date', dateISO)

  const diarioContent = dailyResult.ok ? (
    <DailyAttendanceTable
      key={dailyResult.date}
      dateISO={dailyResult.date}
      rows={dailyResult.data}
      canWrite={canWrite}
      pendingCount={canJustify ? pendingCount : undefined}
      pendingHref={`?${pendingParams}`}
    />
  ) : (
    <Alert size="md">{dailyResult.error}</Alert>
  )

  const resumenContent = monthlyResult.ok ? (
    <MonthlySummaryTable monthISO={monthISO} rows={monthlyResult.data} />
  ) : (
    <Alert size="md">{monthlyResult.error}</Alert>
  )

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

  return (
    <div className="min-w-0 space-y-4">
      {header}
      <AttendanceTabs
        diarioContent={diarioContent}
        resumenContent={resumenContent}
        justificarContent={justificarContent}
        pendingCount={pendingCount}
      />
    </div>
  )
}
