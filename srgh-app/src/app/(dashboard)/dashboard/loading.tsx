import { cn } from '@/lib/utils/cn'
import { CARD } from '@/components/ui/styles'
import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton'

/** Silueta de Inicio: el saludo con sus indicadores y la grilla de paneles. */
export default function DashboardHomeLoading() {
  return (
    <div className="@container mx-auto max-w-6xl">
      <SkeletonRegion>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 @2xl:p-7">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2.5 @lg:grid-cols-3 @3xl:max-w-md @5xl:max-w-xl">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(CARD, 'flex items-center gap-2.5 p-3')}>
                <Skeleton className="h-8 w-8 shrink-0" rounded="rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-4 w-10" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="grid gap-4 @2xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 border border-slate-200" rounded="rounded-2xl" />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  )
}
