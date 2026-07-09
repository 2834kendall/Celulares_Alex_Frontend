import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSchedules } from '@/modules/schedules/actions/getSchedules'
import { getShiftTypes } from '@/modules/schedules/actions/getShiftTypes'
import { getWeeklySchedule } from '@/modules/schedules/actions/getWeeklySchedule'
import { SchedulesList } from '@/modules/schedules/components/SchedulesList'
import { ScheduleTabs } from '@/modules/schedules/components/ScheduleTabs'
import { WeeklyScheduleMatrix } from '@/modules/schedules/components/WeeklyScheduleMatrix'
import { currentMondayISO } from '@/modules/schedules/lib/week'

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

  const [schedulesResult, shiftTypesResult, weeklyScheduleResult] = await Promise.all([
    getSchedules(),
    getShiftTypes(),
    getWeeklySchedule(weekStartISO),
  ])

  if (!schedulesResult.ok) {
    return <p className="text-rose-600">{schedulesResult.error}</p>
  }

  if (!shiftTypesResult.ok) {
    return <p className="text-rose-600">{shiftTypesResult.error}</p>
  }

  if (!weeklyScheduleResult.ok) {
    return <p className="text-rose-600">{weeklyScheduleResult.error}</p>
  }

  return (
    <div className="p-6 min-w-0">
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
      />
    </div>
  )
}
