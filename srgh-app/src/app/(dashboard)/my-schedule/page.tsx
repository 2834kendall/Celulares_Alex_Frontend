import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getMySchedule } from '@/modules/schedules/actions/getMySchedule'
import { currentMondayISO, isValidISODate } from '@/modules/schedules/lib/week'
import { MyScheduleView } from '@/modules/schedules/components/MyScheduleView'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

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

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Mi horario" />
      {result.ok ? (
        <MyScheduleView
          weekStartISO={weekStartISO}
          weekDates={result.weekDates}
          days={result.days}
          weeklyTotal={result.weeklyTotal}
        />
      ) : (
        <Alert size="md">{result.error}</Alert>
      )}
    </div>
  )
}
