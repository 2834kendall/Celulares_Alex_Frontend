import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonRegion, TableSkeleton, TabsSkeleton } from '@/components/ui/Skeleton'

/** Silueta de Horarios: pestañas y la matriz semanal (colaborador + 7 días). */
export default function ScheduleLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Horarios" />
      <SkeletonRegion>
        <TabsSkeleton count={4} />
        <TableSkeleton columns={8} rows={6} />
      </SkeletonRegion>
    </div>
  )
}
