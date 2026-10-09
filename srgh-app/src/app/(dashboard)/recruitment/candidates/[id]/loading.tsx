import { PageSkeleton } from '@/components/ui/Skeleton'

// Sin este archivo, la carga mostraria la silueta del tablero de
// reclutamiento (el loading.tsx del segmento padre). Cubre tambien /hire.
export default function Loading() {
  return <PageSkeleton back />
}
