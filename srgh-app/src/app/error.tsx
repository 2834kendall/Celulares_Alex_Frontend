'use client'

import { useEffect } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { AUTH_SUBMIT, SubmitSheen } from '@/modules/auth/components/AuthShell'
import { PublicStateScreen } from '@/modules/auth/components/PublicStateScreen'

/**
 * Error fuera del dashboard (login, kiosco, comprobantes...). Vive DENTRO del
 * layout raíz, así que no lleva `<html>`/`<body>`: eso es de global-error.tsx,
 * que lo reusa cuando el que falla es el propio layout.
 */
export default function RootError({
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
    <PublicStateScreen
      kind="error"
      badge={<TriangleAlert className="h-6 w-6" />}
      title="Algo salió mal"
      description="Ocurrió un error inesperado. Intente de nuevo; si sigue pasando, avise a un administrador."
    >
      <button type="button" onClick={reset} className={AUTH_SUBMIT}>
        <SubmitSheen />
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reintentar
      </button>
    </PublicStateScreen>
  )
}
