import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonRegion, TableSkeleton } from '@/components/ui/Skeleton'

/**
 * Silueta del listado de periodos de nómina. Las acciones del encabezado
 * dependen de permisos, asi que no se dibujan.
 *
 * OJO: este archivo tambien seria el respaldo de las subrutas de nómina. Cada
 * una tiene su propio `loading.tsx`, y una subruta nueva tiene que tener el
 * suyo, o mostraria esta silueta de listado.
 */
export default function PayrollLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Nómina" />
      <SkeletonRegion>
        <TableSkeleton toolbar={2} columns={5} />
      </SkeletonRegion>
    </div>
  )
}
