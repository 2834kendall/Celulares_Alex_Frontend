import { Construction } from 'lucide-react'

interface ModulePlaceholderProps {
  title: string
  description?: string
}

/**
 * Contenido temporal para zonas cuyo modulo aun esta en desarrollo.
 * Cada equipo lo reemplaza con los componentes reales de su modulo
 * (src/modules/<dominio>/components) cuando construya la funcionalidad.
 */
export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Construction className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {description ?? 'Este modulo esta en construccion. Pronto estara disponible.'}
        </p>
      </div>
    </section>
  )
}
