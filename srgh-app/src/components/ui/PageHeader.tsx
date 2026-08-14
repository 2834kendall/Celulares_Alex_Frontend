import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  /** Si se pasa, se muestra la flecha de volver a esa ruta. */
  backHref?: string
  /** Nombre accesible de la flecha ("Volver a nómina"). */
  backLabel?: string
  /** Acciones alineadas a la derecha del titulo. */
  actions?: React.ReactNode
}

/**
 * Encabezado de pantalla: flecha de volver opcional, titulo y bajada.
 *
 * El mismo bloque estaba copiado en ocho `page.tsx` del dashboard, incluida la
 * flecha con su `aria-label` y su anillo de foco.
 */
export function PageHeader({ title, description, backHref, backLabel, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel ?? 'Volver'}
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-900">{title}</h1>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  )
}
