import { CARD } from '@/components/ui/styles'
import {
  PageHeaderSkeleton,
  Skeleton,
  SkeletonRegion,
  TabsSkeleton,
} from '@/components/ui/Skeleton'

/**
 * Silueta del detalle de una sucursal: encabezado con volver, las pestañas
 * Datos / Kioscos y el formulario. Sin este archivo, la carga mostraba la
 * silueta del listado (el loading.tsx del segmento padre), que no tiene ni
 * pestañas ni botón de volver. Cambiar de pestaña también pasa por acá,
 * porque la pestaña vive en la URL (`?tab=kioscos`).
 */
export default function LoadingBranch() {
  return (
    <SkeletonRegion>
      <PageHeaderSkeleton back />
      <TabsSkeleton count={2} />
      <div className={`${CARD} space-y-5 p-5`}>
        <Skeleton className="h-4 w-44" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-9" rounded="rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-9" rounded="rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  )
}
