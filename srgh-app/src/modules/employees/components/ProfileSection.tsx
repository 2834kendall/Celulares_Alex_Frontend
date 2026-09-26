import { META_LABEL } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'

/**
 * Piezas de presentación de solo lectura del perfil del empleado. Las
 * comparten los tabs de Perfil y Contrato para que las dos secciones se lean
 * igual.
 */

export function InfoItem({
  label,
  value,
  wrap = false,
  badge = null,
}: {
  /** Casi siempre texto; el campo de Cumpleaños le suma un icono. */
  label: React.ReactNode
  value: string
  /** Para textos largos (señas exactas): envuelve en vez de recortar. */
  wrap?: boolean
  /** Pastilla al lado de la etiqueta (hoy: el aviso de cumpleaños). */
  badge?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className={cn(META_LABEL, badge ? 'flex items-center gap-1.5' : undefined)}>
        {label}
        {badge}
      </dt>
      <dd
        className={`text-sm text-slate-800 ${wrap ? 'whitespace-pre-line break-words' : 'truncate'}`}
      >
        {value}
      </dd>
    </div>
  )
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  /** Control opcional alineado a la derecha del título. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
