import Link from 'next/link'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { StatePanel } from '@/components/ui/StatePanel'
import { cn } from '@/lib/utils/cn'

/**
 * 404 dentro de la app: lo muestran los `notFound()` de las fichas (empleado,
 * periodo, candidato) cuando el registro no existe o no es visible. Lo envuelve
 * el layout del dashboard, así que el menú sigue a mano.
 */
export default function DashboardNotFound() {
  return (
    <StatePanel
      kind="not-found"
      title="No encontramos esta página"
      description="Puede que el registro ya no exista o que el enlace esté incompleto."
      actions={
        <Link
          href="/dashboard"
          className={cn(BUTTON_BASE, BUTTON_VARIANTS.primary, BUTTON_SIZES.lg)}
        >
          Ir al inicio
        </Link>
      }
    />
  )
}
