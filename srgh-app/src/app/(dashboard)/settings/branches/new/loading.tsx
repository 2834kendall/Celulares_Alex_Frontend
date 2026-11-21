import { PageSkeleton } from '@/components/ui/Skeleton'

// Sin este archivo, la carga mostraría la silueta del listado de sucursales
// (el loading.tsx del segmento padre), sin el botón de volver.
export default function LoadingNewBranch() {
  return <PageSkeleton back />
}
