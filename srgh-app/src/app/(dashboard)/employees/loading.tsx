import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonRegion, StatCardsSkeleton, TableSkeleton } from '@/components/ui/Skeleton'

/**
 * Silueta del listado de empleados. El titulo es el real: aparece al
 * instante. Las acciones y la pestaña de Usuarios dependen de permisos, asi
 * que no se dibujan.
 *
 * OJO: este archivo tambien seria el respaldo de las subrutas
 * (`/employees/[id]`, `/employees/new`). Cada una tiene su propio
 * `loading.tsx`, y una subruta nueva tiene que tener el suyo, o mostraria
 * esta silueta de listado.
 */
export default function EmployeesLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Empleados" />
      <SkeletonRegion>
        <StatCardsSkeleton />
        <TableSkeleton toolbar={2} columns={6} />
      </SkeletonRegion>
    </div>
  )
}
