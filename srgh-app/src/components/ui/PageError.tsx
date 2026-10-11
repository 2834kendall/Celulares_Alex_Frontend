import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

interface PageErrorProps {
  /** Titulo de la pantalla que fallo: sigue siendo el `<h1>` de la ruta. */
  title: string
  backHref?: string
  backLabel?: string
  children: React.ReactNode
}

/**
 * Pantalla que no pudo cargar sus datos: el mismo encabezado que tendria con
 * exito y el error debajo.
 *
 * Existe porque la barra superior ya no muestra el titulo de la ruta. Un
 * `<Alert>` suelto como unico contenido dejaba la pantalla sin titulo ni
 * flecha de volver.
 */
export function PageError({ title, backHref, backLabel, children }: PageErrorProps) {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title={title} backHref={backHref} backLabel={backLabel} />
      <Alert size="md">{children}</Alert>
    </div>
  )
}
