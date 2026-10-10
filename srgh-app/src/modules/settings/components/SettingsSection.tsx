import type { LocatedLeaf } from '@/modules/settings/lib/sections'
import { PageHeader } from '@/components/ui/PageHeader'

interface SettingsSectionProps {
  section: LocatedLeaf
  children: React.ReactNode
}

/**
 * Encabezado común de cada subpágina de Configuración: la ruta del ajuste
 * ("Empleados / Puestos") como título y su descripción. Usa el mismo
 * `PageHeader` que el resto del dashboard, así que es el `<h1>` de la página.
 */
export function SettingsSection({ section, children }: SettingsSectionProps) {
  const titleId = `settings-${section.leaf.id}-title`

  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-4">
      <PageHeader titleId={titleId} title={section.path} description={section.leaf.description} />
      {children}
    </section>
  )
}
