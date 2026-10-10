import { cn } from '@/lib/utils/cn'
import { CARD } from '@/components/ui/styles'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton'

/** Silueta de Mi horario: la tarjeta de la semana con sus siete días. */
export default function MyScheduleLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Mi horario" />
      <SkeletonRegion>
        <div className={cn(CARD, 'space-y-4 p-5')}>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-8 w-24" rounded="rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-24" rounded="rounded-xl" />
            ))}
          </div>
        </div>
      </SkeletonRegion>
    </div>
  )
}
