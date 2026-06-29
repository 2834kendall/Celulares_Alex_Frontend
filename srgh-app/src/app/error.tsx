// app/error.tsx
'use client'

import { useEffect } from 'react'

export default function GlobalError({
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
    <html lang="es">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '1rem',
          }}
        >
          <h2>Algo salió mal</h2>
          <p>Ocurrió un error inesperado en la aplicación.</p>
          <button onClick={reset}>Reintentar</button>
        </div>
      </body>
    </html>
  )
}
