import { PageHeader } from '@/components/ui/PageHeader'
import {
  SkeletonRegion,
  StatCardsSkeleton,
  TableSkeleton,
  TabsSkeleton,
} from '@/components/ui/Skeleton'

/** Silueta de Asistencia: pestañas, indicadores del día y la tabla. */
export default function AttendanceLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Asistencia" />
      <SkeletonRegion>
        <TabsSkeleton count={3} />
        <StatCardsSkeleton />
        <TableSkeleton columns={6} />
      </SkeletonRegion>
    </div>
  )
}
