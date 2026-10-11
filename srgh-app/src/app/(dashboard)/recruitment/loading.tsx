import { cn } from '@/lib/utils/cn'
import { CARD } from '@/components/ui/styles'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton'

/**
 * Silueta del tablero de reclutamiento: filtros y columnas de postulaciones.
 *
 * OJO: este archivo tambien seria el respaldo de la ficha del candidato
 * (`/recruitment/candidates/[id]`), que tiene su propio `loading.tsx`. Una
 * subruta nueva tiene que tener el suyo, o mostraria este tablero.
 */
export default function RecruitmentLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Reclutamiento" />
      <SkeletonRegion className="@container">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-0 flex-1 basis-56" rounded="rounded-xl" />
          <Skeleton className="h-9 w-40" rounded="rounded-xl" />
        </div>
        <div className="grid gap-3 @lg:grid-cols-3">
          {[0, 1, 2].map((column) => (
            <div key={column} className="space-y-2.5 rounded-2xl bg-slate-100/70 p-3">
              <Skeleton className="h-3 w-24" />
              {[0, 1, 2].map((card) => (
                <div key={card} className={cn(CARD, 'space-y-2 p-3')}>
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </div>
  )
}
