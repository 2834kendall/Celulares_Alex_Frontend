'use client'

import './globals.css'
import RootError from './error'

/**
 * Error en el propio layout raíz. Next lo muestra EN LUGAR del layout, así que
 * trae su `<html>`/`<body>` y la hoja de estilos (sin ella, la pantalla de
 * error saldría sin estilos). El contenido es el mismo que el de error.tsx.
 */
export default function GlobalError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <RootError {...props} />
      </body>
    </html>
  )
}
