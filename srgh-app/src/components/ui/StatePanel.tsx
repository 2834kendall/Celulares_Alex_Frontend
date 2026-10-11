import type { ReactNode } from 'react'
import { StateScene, type StateKind } from '@/components/scene/StateScene'

interface StatePanelProps {
  kind: StateKind
  title: string
  description: string
  /** Solo `empty`: icono estampado en la caja de la escena, ya renderizado. */
  icon?: ReactNode
  /** Botones o enlaces de salida ("Reintentar", "Ir al inicio"). */
  actions?: ReactNode
}

/**
 * Estado de pantalla completa DENTRO de la app (404 de un registro, error de
 * una sección, módulo no disponible): conserva el menú y la barra, y ocupa el
 * lugar de la página con una tarjeta centrada y su escena.
 *
 * Lleva el `<h1>` de la ruta: reemplaza a la página entera, PageHeader incluido.
 * Las pantallas sin AppShell (404 general, sin acceso) usan PublicStateScreen.
 */
export function StatePanel({ kind, title, description, icon, actions }: StatePanelProps) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm sm:px-10">
        <div className="relative mx-auto h-40 w-full max-w-72">
          <StateScene kind={kind}>{icon}</StateScene>
        </div>
        <div className="empty-state-copy">
          <h1 className="mt-4 text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
        </div>
        {actions && (
          <div className="empty-state-copy mt-6 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </section>
  )
}
