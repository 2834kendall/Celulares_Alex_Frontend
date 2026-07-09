import { BRAND } from '@/lib/brand'

export default function DashboardPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Panel principal
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
          Bienvenido a {BRAND.sistema}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          Sistema de Gestion de Recursos Humanos de {BRAND.empresa}. Usa el menu lateral para
          acceder a las zonas del sistema — las opciones visibles dependen de los permisos de tu
          rol. Los indicadores del panel se habilitaran conforme los modulos entren en operacion.
        </p>
      </div>
    </section>
  )
}
