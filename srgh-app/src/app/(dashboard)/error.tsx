'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button, BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { StatePanel } from '@/components/ui/StatePanel'
import { cn } from '@/lib/utils/cn'

/** Error de una sección del dashboard: se muestra dentro de la app, con el menú. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatePanel
      kind="error"
      title="No se pudo cargar esta sección"
      description="Hubo un problema al cargar el contenido. Intente de nuevo en unos segundos."
      actions={
        <>
          <Button size="lg" onClick={reset}>
            Reintentar
          </Button>
          <Link
            href="/dashboard"
            className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.lg)}
          >
            Ir al inicio
          </Link>
        </>
      }
    />
  )
}
