import { PageHeader } from '@/components/ui/PageHeader'
import {
  Skeleton,
  SkeletonRegion,
  StatCardsSkeleton,
  TableSkeleton,
  TabsSkeleton,
} from '@/components/ui/Skeleton'

export default function AttendanceLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Asistencia" />
      <SkeletonRegion className="@container">
        <div className="overflow-hidden">
          <TabsSkeleton count={3} />
        </div>
        <div className="hidden @md:block">
          <StatCardsSkeleton count={3} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-9 w-40" rounded="rounded-xl" />
          <Skeleton className="h-9 w-56 max-w-full" rounded="rounded-xl" />
        </div>
        <TableSkeleton columns={6} />
      </SkeletonRegion>
    </div>
  )
}
