import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ICON_CONTROL_BASE, ICON_CONTROL_TONES } from '@/components/ui/IconButton'

interface PageHeaderProps {
  title: string
  /**
   * Una sola linea corta. Las pantallas principales de cada modulo no la
   * llevan (el menu ya dice donde estas); las subpaginas y formularios si,
   * cuando explican un proceso.
   */
  description?: React.ReactNode
  /** Si se pasa, se muestra la flecha de volver a esa ruta. */
  backHref?: string
  /** Nombre accesible de la flecha ("Volver a nómina"). */
  backLabel?: string
  /**
   * Acciones a la derecha del titulo. Se renderizan tal cual: cada pantalla
   * trae su propio contenedor responsive (`@sm:` funciona porque el header es
   * un `@container`).
   */
  actions?: React.ReactNode
  /** Reemplaza la barra de acento (p. ej. el avatar en la ficha del empleado). */
  leading?: React.ReactNode
  /** Id del `<h1>`, para secciones que lo referencian con `aria-labelledby`. */
  titleId?: string
}

/**
 * Encabezado unico de todas las pantallas del dashboard.
 *
 * Desde que la barra superior dejo de mostrar el titulo de la ruta, este es
 * el unico `<h1>` de cada pagina: toda ruta tiene que renderizarlo, incluidas
 * sus ramas de error.
 *
 * La barra de acento mide lo mismo que el alto de linea del titulo (30px) para
 * quedar alineada con la primera linea aunque haya descripcion debajo.
 */
export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
  leading,
  titleId,
}: PageHeaderProps) {
  return (
    <div className="@container">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              aria-label={backLabel ?? 'Volver'}
              className={cn(ICON_CONTROL_BASE, ICON_CONTROL_TONES.slate, 'shrink-0')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <div className="flex min-w-0 items-center gap-2.5">
            {leading ?? (
              <span
                aria-hidden="true"
                data-testid="page-header-accent"
                className="h-[30px] w-[3px] shrink-0 self-start rounded-full bg-brand-600"
              />
            )}
            <div className="min-w-0">
              <h1
                id={titleId}
                className="break-words text-[25px] leading-[30px] font-bold tracking-tight text-slate-900"
              >
                {title}
              </h1>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
          </div>
        </div>
        {actions}
      </div>
    </div>
  )
}
