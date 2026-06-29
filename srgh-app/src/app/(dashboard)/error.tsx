// app/(dashboard)/error.tsx
'use client'

import { useEffect } from 'react'

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
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-lg font-semibold">No se pudo cargar esta sección</h2>
      <p className="text-sm text-muted-foreground">
        Hubo un problema al cargar el contenido del dashboard.
      </p>
      <button onClick={reset} className="px-4 py-2 rounded bg-primary text-primary-foreground">
        Reintentar
      </button>
    </div>
  )
}
