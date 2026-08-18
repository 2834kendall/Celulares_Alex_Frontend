import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getMySchedule } from '@/modules/schedules/actions/getMySchedule'
import { currentMondayISO, isValidISODate } from '@/modules/schedules/lib/week'
import { MyScheduleView } from '@/modules/schedules/components/MyScheduleView'
import { Alert } from '@/components/ui/Alert'

interface MySchedulePageProps {
  searchParams?:
    | {
        week?: string
      }
    | Promise<{
        week?: string
      }>
}

export default async function MySchedulePage({ searchParams }: MySchedulePageProps) {
  await requirePermission(PERMISOS.MI_HORARIO_READ)

  const resolvedSearchParams = await Promise.resolve(searchParams)
  const weekParam = resolvedSearchParams?.week
  const weekStartISO = weekParam && isValidISODate(weekParam) ? weekParam : currentMondayISO()

  const result = await getMySchedule(weekStartISO)

  if (!result.ok) {
    return <Alert size="md">{result.error}</Alert>
  }

  return (
    <MyScheduleView
      weekStartISO={weekStartISO}
      weekDates={result.weekDates}
      days={result.days}
      weeklyTotal={result.weeklyTotal}
    />
  )
}
