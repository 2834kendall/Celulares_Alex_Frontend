import { PageHeader } from '@/components/ui/PageHeader'
import {
  SkeletonRegion,
  StatCardsSkeleton,
  TableSkeleton,
  TabsSkeleton,
} from '@/components/ui/Skeleton'

/** Silueta de Evaluaciones: pestañas, métricas de la sucursal y la tabla. */
export default function EvaluationsLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Evaluaciones" />
      <SkeletonRegion>
        <TabsSkeleton count={3} />
        <StatCardsSkeleton />
        <TableSkeleton columns={5} />
      </SkeletonRegion>
    </div>
  )
}
