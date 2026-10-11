import { PageSkeleton } from '@/components/ui/Skeleton'

// Sin este archivo, la carga mostraria la silueta del listado de empleados
// (el loading.tsx del segmento padre).
export default function Loading() {
  return <PageSkeleton back />
}
