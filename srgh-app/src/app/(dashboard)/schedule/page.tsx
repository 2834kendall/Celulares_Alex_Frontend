import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSchedules } from '@/modules/schedules/actions/getSchedules'
import { getShiftTypes } from '@/modules/schedules/actions/getShiftTypes'
import { getWeeklySchedule } from '@/modules/schedules/actions/getWeeklySchedule'
import { SchedulesList } from '@/modules/schedules/components/SchedulesList'
import { ScheduleTabs } from '@/modules/schedules/components/ScheduleTabs'
import { ShiftTypesList } from '@/modules/schedules/components/ShiftTypesList'
import { WeeklyScheduleMatrix } from '@/modules/schedules/components/WeeklyScheduleMatrix'
import { currentMondayISO, getWeekDates, isValidISODate } from '@/modules/schedules/lib/week'
import { getAusenciaTypes } from '@/modules/absences/actions/getAusenciaTypes'
import { getAusenciasForWeek } from '@/modules/absences/actions/getAusenciasForWeek'
import { buildAusenciaOverlayEntries } from '@/modules/absences/lib/overlay'
import { AbsencesPanel } from '@/modules/absences/components/AbsencesPanel'
import type { EmployeeOption } from '@/modules/absences/types'
import { Alert } from '@/components/ui/Alert'

interface SchedulePageProps {
  searchParams?:
    | {
        week?: string
      }
    | Promise<{
        week?: string
      }>
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const weekParam = resolvedSearchParams?.week
  const weekStartISO = weekParam && isValidISODate(weekParam) ? weekParam : currentMondayISO()
  const weekDates = getWeekDates(weekStartISO)

  const claims = await requirePermission(PERMISOS.HORARIOS_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.HORARIOS_WRITE)
  const canWriteShiftTypes = permisos.includes(PERMISOS.CATALOGOS_WRITE)
  // sgrh_programacion_semanal's RLS policies are governed by ASISTENCIA
  // permissions; the app follows the same criteria.
  const canReadMatrix = permisos.includes(PERMISOS.ASISTENCIA_READ)
  const canWriteMatrix = permisos.includes(PERMISOS.ASISTENCIA_WRITE)
  const canReadAusencias = permisos.includes(PERMISOS.AUSENCIAS_READ)
  const canManageAbsences = permisos.includes(PERMISOS.AUSENCIAS_APPROVE)

  const [
    schedulesResult,
    shiftTypesResult,
    weeklyScheduleResult,
    ausenciaTypesResult,
    ausenciasResult,
  ] = await Promise.all([
    getSchedules(),
    getShiftTypes(),
    canReadMatrix ? getWeeklySchedule(weekStartISO) : Promise.resolve(null),
    getAusenciaTypes(),
    canReadAusencias ? getAusenciasForWeek(weekDates[0], weekDates[6]) : Promise.resolve(null),
  ])

  if (!schedulesResult.ok) {
    return <Alert size="md">{schedulesResult.error}</Alert>
  }

  if (!shiftTypesResult.ok) {
    return <Alert size="md">{shiftTypesResult.error}</Alert>
  }

  if (weeklyScheduleResult && !weeklyScheduleResult.ok) {
    return <Alert size="md">{weeklyScheduleResult.error}</Alert>
  }

  if (!ausenciaTypesResult.ok) {
    return <Alert size="md">{ausenciaTypesResult.error}</Alert>
  }

  // Un fallo al cargar las ausencias (ej. la migracion de tau_es_intradia aun
  // no aplicada) no debe tumbar toda la pagina de horarios: se degrada a
  // "sin ausencias" para la matriz y el error solo se muestra en su propia
  // pestaña, donde es accionable.
  const ausenciasError = ausenciasResult && !ausenciasResult.ok ? ausenciasResult.error : null
  const ausenciasData = ausenciasResult?.ok ? ausenciasResult.data : []

  const ausenciaOverlay = weeklyScheduleResult
    ? buildAusenciaOverlayEntries(ausenciasData, weeklyScheduleResult.weekDates)
    : []

  const employeeOptions: EmployeeOption[] = (weeklyScheduleResult?.data ?? []).map((row) => ({
    employmentHistoryId: row.employmentHistoryId,
    fullName: row.fullName,
    position: row.position,
    branchName: row.branchName,
  }))

  return (
    <div className="min-w-0 space-y-4">
      <ScheduleTabs
        plantillaContent={
          weeklyScheduleResult ? (
            <WeeklyScheduleMatrix
              weekStartISO={weekStartISO}
              weekDates={weeklyScheduleResult.weekDates}
              rows={weeklyScheduleResult.data}
              schedules={schedulesResult.data}
              canWrite={canWriteMatrix}
              ausencias={ausenciaOverlay}
            />
          ) : (
            <Alert tone="info" size="md">
              <p>
                Tu rol no tiene permiso de asistencia, necesario para ver la programación semanal de
                los colaboradores.
              </p>
            </Alert>
          )
        }
        especialesContent={
          <SchedulesList
            schedules={schedulesResult.data}
            shiftTypes={shiftTypesResult.data}
            canWrite={canWrite}
          />
        }
        jornadasContent={
          <ShiftTypesList shiftTypes={shiftTypesResult.data} canWrite={canWriteShiftTypes} />
        }
        ausenciasContent={
          canReadAusencias ? (
            ausenciasError ? (
              <Alert size="md">{ausenciasError}</Alert>
            ) : (
              <AbsencesPanel
                employees={employeeOptions}
                ausenciaTypes={ausenciaTypesResult.data}
                ausencias={ausenciasData}
                canManageAbsences={canManageAbsences}
              />
            )
          ) : (
            <Alert tone="info" size="md">
              <p>Tu rol no tiene permiso para ver incapacidades y periodos de lactancia.</p>
            </Alert>
          )
        }
      />
    </div>
  )
}
