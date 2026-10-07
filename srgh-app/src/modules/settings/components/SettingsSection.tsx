import type { LocatedLeaf } from '@/modules/settings/lib/sections'

interface SettingsSectionProps {
  section: LocatedLeaf
  children: React.ReactNode
}

/**
 * Encabezado común de cada subpágina de Configuración: la ruta del ajuste
 * ("Empleados / Puestos") como título y su descripción.
 */
export function SettingsSection({ section, children }: SettingsSectionProps) {
  const titleId = `settings-${section.leaf.id}-title`

  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-4">
      <div>
        <h2 id={titleId} className="text-base font-bold text-slate-900">
          {section.path}
        </h2>
        <p className="text-sm text-slate-500">{section.leaf.description}</p>
      </div>
      {children}
    </section>
  )
}
