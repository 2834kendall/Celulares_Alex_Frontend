import { AlertTriangle } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSchedules } from '@/modules/schedules/actions/getSchedules'
import { getShiftTypes } from '@/modules/schedules/actions/getShiftTypes'
import { getWeeklySchedule } from '@/modules/schedules/actions/getWeeklySchedule'
import { SchedulesList } from '@/modules/schedules/components/SchedulesList'
import { ScheduleTabs } from '@/modules/schedules/components/ScheduleTabs'
import { ShiftTypesList } from '@/modules/schedules/components/ShiftTypesList'
import { WeeklyScheduleMatrix } from '@/modules/schedules/components/WeeklyScheduleMatrix'
import { currentMondayISO } from '@/modules/schedules/lib/week'

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
  const weekStartISO = resolvedSearchParams?.week ?? currentMondayISO()

  const claims = await requirePermission(PERMISOS.HORARIOS_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.HORARIOS_WRITE)
  const canWriteJornadas = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  const [schedulesResult, shiftTypesResult, weeklyScheduleResult] = await Promise.all([
    getSchedules(),
    getShiftTypes(),
    getWeeklySchedule(weekStartISO),
  ])

  if (!schedulesResult.ok) {
    return <ErrorBanner message={schedulesResult.error} />
  }

  if (!shiftTypesResult.ok) {
    return <ErrorBanner message={shiftTypesResult.error} />
  }

  if (!weeklyScheduleResult.ok) {
    return <ErrorBanner message={weeklyScheduleResult.error} />
  }

  return (
    <div className="min-w-0 space-y-4">
      <ScheduleTabs
        plantillaContent={
          <WeeklyScheduleMatrix
            weekStartISO={weekStartISO}
            weekDates={weeklyScheduleResult.weekDates}
            rows={weeklyScheduleResult.data}
            schedules={schedulesResult.data}
            canWrite={canWrite}
          />
        }
        especialesContent={
          <SchedulesList
            schedules={schedulesResult.data}
            tiposJornada={shiftTypesResult.data}
            canWrite={canWrite}
          />
        }
        jornadasContent={
          <ShiftTypesList tiposJornada={shiftTypesResult.data} canWrite={canWriteJornadas} />
        }
      />
    </div>
  )
}
