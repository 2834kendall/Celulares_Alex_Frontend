import { AlertTriangle, Info } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSchedules } from '@/modules/schedules/actions/getSchedules'
import { getShiftTypes } from '@/modules/schedules/actions/getShiftTypes'
import { getWeeklySchedule } from '@/modules/schedules/actions/getWeeklySchedule'
import { SchedulesList } from '@/modules/schedules/components/SchedulesList'
import { ScheduleTabs } from '@/modules/schedules/components/ScheduleTabs'
import { ShiftTypesList } from '@/modules/schedules/components/ShiftTypesList'
import { WeeklyScheduleMatrix } from '@/modules/schedules/components/WeeklyScheduleMatrix'
import { currentMondayISO, isValidISODate } from '@/modules/schedules/lib/week'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

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

  const claims = await requirePermission(PERMISOS.HORARIOS_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.HORARIOS_WRITE)
  const canWriteShiftTypes = permisos.includes(PERMISOS.CATALOGOS_WRITE)
  // sgrh_programacion_semanal's RLS policies are governed by ASISTENCIA
  // permissions; the app follows the same criteria.
  const canReadMatrix = permisos.includes(PERMISOS.ASISTENCIA_READ)
  const canWriteMatrix = permisos.includes(PERMISOS.ASISTENCIA_WRITE)

  const [schedulesResult, shiftTypesResult, weeklyScheduleResult] = await Promise.all([
    getSchedules(),
    getShiftTypes(),
    canReadMatrix ? getWeeklySchedule(weekStartISO) : Promise.resolve(null),
  ])

  if (!schedulesResult.ok) {
    return <ErrorBanner message={schedulesResult.error} />
  }

  if (!shiftTypesResult.ok) {
    return <ErrorBanner message={shiftTypesResult.error} />
  }

  if (weeklyScheduleResult && !weeklyScheduleResult.ok) {
    return <ErrorBanner message={weeklyScheduleResult.error} />
  }

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
            />
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p>
                Tu rol no tiene permiso de asistencia, necesario para ver la programación semanal de
                los colaboradores.
              </p>
            </div>
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
      />
    </div>
  )
}
