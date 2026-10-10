import { PageSkeleton } from '@/components/ui/Skeleton'

/**
 * Respaldo de carga de todo el dashboard (perfil, configuración y cualquier
 * ruta sin `loading.tsx` propio). Se dibuja dentro del `<main>` del AppShell,
 * asi que no pinta fondo propio: hereda `--page-bg`, el color de la sucursal.
 */
export default function DashboardLoading() {
  return <PageSkeleton />
}
